// Lambda: updateInspection
// Updates inspection checklist, notes, and images metadata

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
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
    const inspectionId = event.pathParameters?.inspectionId;
    const body = JSON.parse(event.body || "{}");

    if (!inspectionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing inspectionId parameter" }),
      };
    }

    // Check if inspection exists
    const existing = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `INSPECTION#${inspectionId}`, SK: "METADATA" },
      })
    );

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: "Inspection not found" }),
      };
    }

    const now = new Date().toISOString();
    const { checklist, notes, images, clientName, clientEmail, status } = body;

    // Build update expression dynamically
    let updateExpr = "SET updatedAt = :updatedAt";
    const exprValues = { ":updatedAt": now };
    const exprNames = {};

    if (checklist) {
      updateExpr += ", checklist = :checklist";
      exprValues[":checklist"] = checklist;
    }

    if (notes !== undefined) {
      updateExpr += ", notes = :notes";
      exprValues[":notes"] = notes;
    }

    if (images) {
      updateExpr += ", images = :images";
      exprValues[":images"] = images;
    }

    if (clientName) {
      updateExpr += ", clientName = :clientName";
      exprValues[":clientName"] = clientName;
    }

    if (clientEmail) {
      updateExpr += ", clientEmail = :clientEmail";
      exprValues[":clientEmail"] = clientEmail;
    }

    if (status) {
      updateExpr += ", #status = :status, GSI1PK = :gsi1pk";
      exprValues[":status"] = status;
      exprValues[":gsi1pk"] = `STATUS#${status}`;
      exprNames["#status"] = "status";
    }

    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `INSPECTION#${inspectionId}`, SK: "METADATA" },
        UpdateExpression: updateExpr,
        ExpressionAttributeValues: exprValues,
        ...(Object.keys(exprNames).length > 0 && {
          ExpressionAttributeNames: exprNames,
        }),
        ReturnValues: "ALL_NEW",
      })
    );

    const { PK, SK, GSI1PK, GSI1SK, ...inspection } = result.Attributes;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: "Inspection updated successfully",
        inspection,
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
