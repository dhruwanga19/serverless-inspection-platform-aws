// Lambda: createInspection
// Creates a new inspection record in DynamoDB

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || "InspectionsTable";

// CORS headers for API Gateway
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET,PUT",
};

exports.handler = async (event) => {
  console.log("Event:", JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || "{}");
    const {
      propertyAddress,
      inspectorName,
      inspectorEmail,
      clientName,
      clientEmail,
    } = body;

    // Validation
    if (!propertyAddress || !inspectorName || !inspectorEmail) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error:
            "Missing required fields: propertyAddress, inspectorName, inspectorEmail",
        }),
      };
    }

    const inspectionId = `insp_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const inspection = {
      PK: `INSPECTION#${inspectionId}`,
      SK: "METADATA",
      GSI1PK: "STATUS#DRAFT",
      GSI1SK: now,
      inspectionId,
      propertyAddress,
      inspectorName,
      inspectorEmail,
      clientName: clientName || "",
      clientEmail: clientEmail || "",
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
      checklist: {
        roof: null,
        foundation: null,
        plumbing: null,
        electrical: null,
        hvac: null,
      },
      notes: "",
      images: [],
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: inspection,
      })
    );

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        message: "Inspection created successfully",
        inspection: {
          inspectionId,
          propertyAddress,
          inspectorName,
          status: "DRAFT",
          createdAt: now,
        },
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
