import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { Response, ExaminatorResponse } from '../response'
import { validateExamToken, validateSessionToken } from './authorization'
import { ExamsTable, ExamUsers } from '../utils'
import { submitAnswerInput } from '../models'
import { ExamTableItem } from '../types'

const { ACCESS_TOKEN_SECRET, EXAM_TOKEN_SECRET } = process.env

const dynamo = new DynamoDBClient({})

// TODO: make this work
export const submitExamAnswer = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const accessToken = event.headers['access-token']
    const examToken = event.headers['exam-token']
    
    const auth = await validateSessionToken(accessToken, ACCESS_TOKEN_SECRET)

    // this will handle -> is exam exist & is exam time ended
    const examAuth = await validateExamToken(examToken, EXAM_TOKEN_SECRET)

    if (examAuth.userId !== auth.userId) {
      throw new Response({ statusCode: 400, message: 'This exam doesnt belong to this user', addons: { examAuth, auth } })
    }

    const { questionId, optionId } = submitAnswerInput.parse(JSON.parse(event.body!))

    const examDB = await dynamo.send(
      new GetCommand({
        TableName: ExamsTable,
        Key: {
          examId: examAuth.examId,
          courseId: examAuth.courseId,
        },
      }),
    )
    
    const exam = examDB.Item as ExamTableItem
    
    if (!exam) {
      throw new Response({ statusCode: 400, message: 'This exam doesnt exist !', addons: { examAuth } })
    }

    if (!exam.questionsMetaData[questionId] || !exam.questionsMetaData[questionId].includes(optionId)) {
      throw new Response({ statusCode: 400, message: 'This exam doesnt have this question or this question doesnt have this option', addons: { examId: examAuth.examId, questionId, optionId } })
    }

    // ********************

    const params = {
      TableName: ExamUsers,
      Key: {
        examId: { S: examAuth.examId },
        userId: { S: examAuth.userId },
      },
      UpdateExpression: 'SET #myMap.#newKey = :newValue',
      ExpressionAttributeNames: {
        '#myMap': 'userAnswers',
        '#newKey': questionId
      },
      ExpressionAttributeValues: {
        ':newValue': { S: optionId }
      }
    };
    
    await dynamo.send(new UpdateItemCommand(params))

    return new Response({ statusCode: 200, body: { success: true } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}



// const params = {
//   TableName: ExamUsers,
//   Key: {
//     examId: { S: examAuth.examId },
//     userId: { S: examAuth.userId },
//   },
//   UpdateExpression: "SET #ua = list_append(if_not_exists(#ua, :empty_list), :ua)",
//   ExpressionAttributeNames: {
//     "#ua": "userAnswers",
//   },
//   ExpressionAttributeValues: {
//     ":ua": {
//       L: [
//         {
//           M: {
//             questionId: { S: questionId },
//             optionId: { S: optionId },
//           },
//         },
//       ],
//     },
//     ":empty_list": { L: [] },
//   },
// };