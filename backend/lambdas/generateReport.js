// Lambda: generateReport
// Aggregates inspection data into a report and publishes to SNS

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const snsClient = new SNSClient({});

const TABLE_NAME = process.env.TABLE_NAME || "InspectionsTable";
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
};

exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  try {
    const inspectionId = event.pathParameters?.inspectionId;

    if (!inspectionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing inspectionId parameter" }),
      };
    }

    // Fetch inspection data
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `INSPECTION#${inspectionId}`, SK: "METADATA" },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "Inspection not found" }),
      };
    }

    const inspection = result.Item;

    // Validate inspection has required data
    if (
      !inspection.checklist ||
      Object.values(inspection.checklist).some((v) => v === null)
    ) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Inspection checklist is incomplete" }),
      };
    }

    const now = new Date().toISOString();

    // Generate simple aggregated report
    const report = {
      reportId: `report_${inspectionId}`,
      inspectionId,
      generatedAt: now,
      propertyAddress: inspection.propertyAddress,
      inspector: {
        name: inspection.inspectorName,
        email: inspection.inspectorEmail,
      },
      client: {
        name: inspection.clientName,
        email: inspection.clientEmail,
      },
      summary: {
        checklist: inspection.checklist,
        overallCondition: calculateOverallCondition(inspection.checklist),
        notes: inspection.notes,
        totalImages: inspection.images?.length || 0,
      },
      images: inspection.images || [],
    };

    // Update inspection status to REPORT_GENERATED
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `INSPECTION#${inspectionId}`, SK: "METADATA" },
        UpdateExpression:
          "SET #status = :status, GSI1PK = :gsi1pk, reportGeneratedAt = :reportGenAt, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": "REPORT_GENERATED",
          ":gsi1pk": "STATUS#REPORT_GENERATED",
          ":reportGenAt": now,
          ":updatedAt": now,
        },
      })
    );

    // Publish to SNS for async notification
    if (SNS_TOPIC_ARN) {
      await snsClient.send(
        new PublishCommand({
          TopicArn: SNS_TOPIC_ARN,
          Subject: "Inspection Report Generated",
          Message: JSON.stringify({
            type: "REPORT_GENERATED",
            inspectionId,
            reportId: report.reportId,
            propertyAddress: inspection.propertyAddress,
            inspectorEmail: inspection.inspectorEmail,
            clientEmail: inspection.clientEmail,
            generatedAt: now,
          }),
          MessageAttributes: {
            eventType: { DataType: "String", StringValue: "REPORT_GENERATED" },
          },
        })
      );
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: "Report generated successfully",
        report,
      }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
    };
  }
};

// Helper function to calculate overall condition
function calculateOverallCondition(checklist) {
  const values = Object.values(checklist);
  const scores = { Good: 3, Fair: 2, Poor: 1 };
  const total = values.reduce((sum, v) => sum + (scores[v] || 0), 0);
  const avg = total / values.length;
  if (avg >= 2.5) return "Good";
  if (avg >= 1.5) return "Fair";
  return "Poor";
}
