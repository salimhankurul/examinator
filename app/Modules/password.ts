import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb"
import { APIGatewayProxyEventV2 } from "aws-lambda"
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { authenticationsTableName } from "../utils"
import { SessionTableItem, ForgetPasswordTokenModel } from "../types"
import { sign, verify } from 'jsonwebtoken'
import { Response, ExaminatorResponse } from '../response'
import { forgetInput, resetPasswordInput } from "../models"
import { encodePassword } from "./authentication"
import { validateResetToken } from "./authorization"

const AWS = require('aws-sdk')

const client = new DynamoDBClient({})
const dynamo = DynamoDBDocumentClient.from(client)

const { FORGET_PASSWORD_TOKEN_SECRET } = process.env

const FORGET_PASSWORD_TOKEN_TTL = 300
const FROM_EMAIL_ADDRESS = 'examinator@info.com' // email adresimiz ne ?

export const forgetPasswordLink = async (event: APIGatewayProxyEventV2): Promise<ExaminatorResponse> => {
  try {

    const input = forgetInput.safeParse(JSON.parse(event.body || '{}'))

    if (input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: input.error.issues } })
    }

    const { email } = input.data

    const dynamoReq = await dynamo.send( // auth db'de email varsa userId'yi alıyoruz
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

    const ses = new AWS.SESV2({})
    const params = {
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

    await ses.sendEmail(params).promise()

    return new Response({ 
      statusCode: 200, 
      body: { 
        resetLink,
        message: 'Email sent' 
      } 
  }).response
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

    const { newPassword, newPasswordConfirm, token } = input.data 

    if (newPassword !== newPasswordConfirm) {
      throw new Response({ statusCode: 400, message: 'Passwords do not match' })
    }

    const forgetPasswordToken = await validateResetToken(token, FORGET_PASSWORD_TOKEN_SECRET)
    
    // reset password and write to db

    const authenticationItem = {
      email: forgetPasswordToken.email,
      password: encodePassword(newPassword),
    }

    await dynamo.send(
      new PutCommand({
        TableName: authenticationsTableName,
        Item: authenticationItem,
      }),
    )

    return new Response({ 
      statusCode: 200, 
      body: { 
        message: 'Password successfully reset' 
      } 
  }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Reset Password Error', statusCode: 400, addons: { error: error.message } }).response
  }
}

