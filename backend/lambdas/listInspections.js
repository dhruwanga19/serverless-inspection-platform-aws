// Lambda: listInspections
// Lists all inspections, optionally filtered by status

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "InspectionsTable";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT",
};

exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  try {
    const status = event.queryStringParameters?.status;
    let result;

    if (status) {
      // Query by status using GSI1
      result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :statusKey",
          ExpressionAttributeValues: {
            ":statusKey": `STATUS#${status.toUpperCase()}`,
          },
          ScanIndexForward: false, // Most recent first
        })
      );
    } else {
      // Scan all inspections
      result = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: "begins_with(PK, :prefix)",
          ExpressionAttributeValues: {
            ":prefix": "INSPECTION#",
          },
        })
      );
    }

    // Clean up response - remove internal keys
    const inspections = (result.Items || []).map((item) => {
      const { PK, SK, GSI1PK, GSI1SK, ...inspection } = item;
      return inspection;
    });

    // Sort by createdAt descending if from scan
    if (!status) {
      inspections.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        count: inspections.length,
        inspections,
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
