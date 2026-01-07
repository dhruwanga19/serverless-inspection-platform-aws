// Lambda: getInspection
// Retrieves a single inspection by ID from DynamoDB

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

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
    const inspectionId = event.pathParameters?.inspectionId;

    if (!inspectionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing inspectionId parameter" }),
      };
    }

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `INSPECTION#${inspectionId}`,
          SK: "METADATA",
        },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "Inspection not found" }),
      };
    }

    // Remove internal DynamoDB keys from response
    const { PK, SK, GSI1PK, GSI1SK, ...inspection } = result.Item;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ inspection }),
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
