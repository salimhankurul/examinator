import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb'
import { SESv2Client, SendEmailCommand, SendEmailCommandInput } from '@aws-sdk/client-sesv2'
import { APIGatewayProxyEventV2 } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { authenticationsTableName } from '../utils'
import { SessionTableItem, ForgetPasswordTokenModel } from '../types'
import { sign } from 'jsonwebtoken'
import { Response, ExaminatorResponse } from '../response'
import { forgetInput, resetPasswordInput } from '../models'
import { encodePassword } from './authentication'
import { validateResetToken } from './authorization'

const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

const sesClient = new SESv2Client({})

const { FORGET_PASSWORD_TOKEN_SECRET } = process.env

const FORGET_PASSWORD_TOKEN_TTL = 300
const FROM_EMAIL_ADDRESS = 'salimhankurul@gmail.com'

export const forgetPasswordLink = async (event: APIGatewayProxyEventV2): Promise<ExaminatorResponse> => {
  try {
    const input = forgetInput.safeParse(JSON.parse(event.body || '{}'))

    if (input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: input.error.issues } })
    }

    const { email } = input.data

    const dynamoReq = await dynamo.send(
      // auth db'de email varsa userId'yi alıyoruz
      new GetCommand({
        TableName: authenticationsTableName,
        Key: {
          email,
        },
      }),
    )

    const sessionItem = dynamoReq.Item as SessionTableItem

    if (!sessionItem) {
      throw new Response({ statusCode: 404, message: `User with ${email} email address could not found` })
    }

    const tokenData: ForgetPasswordTokenModel = {
      email,
    }

    const forgetPasswordToken = sign(tokenData, FORGET_PASSWORD_TOKEN_SECRET, { expiresIn: FORGET_PASSWORD_TOKEN_TTL }) // token oluşturuyoruz

    const resetLink = `https://examinator.com/reset-password?token=${forgetPasswordToken}`

    console.log(resetLink)

    const params: SendEmailCommandInput = {
      Content: {
        Simple: {
          Body: {
            Text: {
              Data: resetLink,
            },
          },
          Subject: {
            Data: 'Reset Password',
          },
        },
      },
      Destination: {
        ToAddresses: [email],
      },
      FromEmailAddress: FROM_EMAIL_ADDRESS,
    }

    await sesClient.send(new SendEmailCommand(params))

    return new Response({statusCode: 200, body: { message: 'Email sent' } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ statusCode: 400, message: 'Reset Link Error', addons: { error: error.message } }).response
  }
}

export const resetPassword = async (event: APIGatewayProxyEventV2): Promise<ExaminatorResponse> => {
  try {
    const input = resetPasswordInput.safeParse(JSON.parse(event.body || '{}'))

    if (input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: input.error.issues } })
    }

    const { newPassword, newPasswordConfirm } = input.data

    if (newPassword !== newPasswordConfirm) {
      throw new Response({ statusCode: 400, message: 'Passwords do not match' })
    }

    const reset_token = event.headers['reset-token']

    const forgetPasswordToken = await validateResetToken(reset_token, FORGET_PASSWORD_TOKEN_SECRET)

    const updateParams: UpdateCommandInput = {
      TableName: authenticationsTableName, // replace with your table name
      Key: { email: forgetPasswordToken.email },
      UpdateExpression: 'SET #password = :newPassword',
      ExpressionAttributeNames: { '#password': 'password' },
      ExpressionAttributeValues: { ':newPassword': encodePassword(newPassword) },
    }

    await dynamo.send(new UpdateCommand(updateParams))

    return new Response({
      statusCode: 200,
      body: {
        message: 'Password successfully reset',
      },
    }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Reset Password Error', statusCode: 400, addons: { error: error.message } }).response
  }
}
