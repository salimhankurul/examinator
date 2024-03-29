import { PutCommand, GetCommand, DeleteCommand, UpdateCommand, UpdateCommandInput, PutCommandInput, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { SFNClient, StartExecutionCommand, StartExecutionCommandInput } from '@aws-sdk/client-sfn'
import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { v4 as uuidv4 } from 'uuid'
import { sign } from 'jsonwebtoken'
import { Readable } from 'stream'
import { validateExamTicketToken, validateFinishToken, validateSessionToken } from './authorization'
import { Response, ExaminatorResponse } from '../response'
import { examinatorBucket, examSessionsTableName, examsTableName, getExamQuestionsS3Path, nanoid, streamToString, usersTableName } from '../utils'
import { ExamS3Item, ExamTableItem, ExamTicketTokenMetaData, ExamSessionTableItem, courses, UsersTableItem, UsersTableItemExam, examStatus, FinishExamTokenMetaData, userExamStatus } from '../types'
import { createExamInput, finisherExamInput, getExamsInput, getResultsInput, joinExamInput, submitAnswerInput } from '../models'

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const { ACCESS_TOKEN_SECRET, EXAM_SESSION_TOKEN_SECRET, FINISH_EXAM_TOKEN_SECRET, FINISHER_MACHINE_ARN } = process.env

const s3 = new S3Client({})

const dynamo = new DynamoDBClient({})

const sf = new SFNClient({})

// This code is responsible for creating an exam. 
// It validates the request, checks if the necessary environment variables are set, and verifies the user's authentication and authorization. 
// It then processes the exam data, generates unique identifiers for questions and options, and stores the exam questions in an S3 bucket. 
// The exam details are saved in a DynamoDB table, and a token is generated for finishing the exam. 
// Finally, the code starts a background process using the token and schedules it to execute after the exam duration. 
// If any errors occur during the process, appropriate error responses are returned.
export const createExam = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (!FINISH_EXAM_TOKEN_SECRET || !FINISHER_MACHINE_ARN || !ACCESS_TOKEN_SECRET) {
      throw new Response({ statusCode: 500, message: 'Server Error ENV vars not set!' })
    }

    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _token = event.headers['access-token']
    const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)

    if (auth.userType !== 'teacher' && auth.userType !== 'admin') {
      throw new Response({ statusCode: 403, message: 'You are not allowed to create exams !' })
    }

    const _input = createExamInput.safeParse(JSON.parse(event.body || '{}'))

    if (_input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: _input.error.issues } })
    }

    const input = _input.data

    const _start = dayjs(input.startDate)
    const _end = _start.add(input.duration, 'minute')

    if (_start.isBefore(Date.now())) {
      throw new Response({ statusCode: 400, message: 'Exam start date is in the past !', addons: { _start: _start.toISOString() } })
    }

    if (_end.isBefore(Date.now())) {
      throw new Response({ statusCode: 400, message: 'Exam end date is in the past !' })
    }

    const course = courses.find((course) => course.id === input.courseId)

    if (!course) {
      throw new Response({ statusCode: 400, message: 'Invalid Course ID !' })
    }

    let totalPoints = 0

    for (const question of input.examQuestions) {
      totalPoints += question.points
    }

    if (totalPoints < input.minimumPassingScore) {
      throw new Response({ statusCode: 400, message: 'Minimum passing score is greater than total points !' })
    }

    // generate exam id
    const examId: string = uuidv4()

    // **********
    // insert exam questions to s3
    // **********

    // generate questions ids and options ids
    const questions = input.examQuestions.map((question) => ({
      questionId: nanoid(10),
      questionText: question.questionText,
      points: question.points,
      options: question.options.map((option) => ({
        optionId: nanoid(5),
        optionText: option.optionText,
        isCorrect: option.isCorrect,
      })),
    }))

    // set correct option id & remove isCorrect
    const examQuestions = questions.map((question) => ({
      ...question,
      correctOptionId: question.options.find((option) => option.isCorrect)!.optionId, // TODO make sure it finds at least 1 is correct
      options: question.options.map((option) => ({
        optionId: option.optionId,
        optionText: option.optionText,
      })),
    }))

    const s3_exam: ExamS3Item = {
      examId,
      examQuestions,
    }

    const s3_put_command = new PutObjectCommand({
      Bucket: examinatorBucket,
      Key: getExamQuestionsS3Path(course.id, examId),
      Body: JSON.stringify(s3_exam),
    })

    // **********
    // insert exam to exam table
    // **********

    const questionsMetaData = {}

    for (const question of examQuestions) {
      questionsMetaData[question.questionId] = question.options.map((option) => option.optionId)
    }

    const db_exam: ExamTableItem = {
      examId,
      courseId: course.id,
      courseName: course.name,
      name: input.name,
      description: input.description,
      minimumPassingScore: input.minimumPassingScore,
      startDate: _start.unix() * 1000,
      endDate: _end.unix() * 1000,
      duration: input.duration,
      questionsMetaData,
      createdAt: new Date().toUTCString(),
      createdBy: auth.userId,
      examStatus: examStatus.enum.normal,
      isOptionsRandomized: input.isOptionsRandomized,
      isQuestionsRandomized: input.isQuestionsRandomized,
      totalPoints,
    }

    const exams_PutCommand = new PutCommand({
      TableName: examsTableName,
      Item: db_exam,
    })

    // **********
    // **********

    const finishTokenData: FinishExamTokenMetaData = {
      examId,
      courseId: course.id,
    }

    // we add 10 seconds since, the finisher machine will start after 5 seconds from finish time
    const timeLeftToFinish = _end.add(10, 'second').diff(dayjs(), 'second')
    const finisherToken = sign(finishTokenData, FINISH_EXAM_TOKEN_SECRET, { expiresIn: timeLeftToFinish })

    // start finisher machine after 5 seconds from finish time
    const startExecutionParams: StartExecutionCommandInput = {
      stateMachineArn: FINISHER_MACHINE_ARN,
      input: JSON.stringify({ executeAt: _end.add(5, 'second').toISOString(), finisherToken }),
    }

    const startExecutionCommand = new StartExecutionCommand(startExecutionParams)
    // **********
    // **********

    const workes = [s3.send(s3_put_command), dynamo.send(exams_PutCommand), sf.send(startExecutionCommand)]

    await Promise.all(workes)

    // **********
    // **********

    return new Response({ statusCode: 200, body: { exam: db_exam } }).response
  } catch (error) {
    console.log(error)
    return error instanceof Response ? error.response : new Response({ statusCode: 400, message: 'Generic Examinator Error', addons: { error: error.message } }).response
  }
}

// This code handles the process of finishing an exam. It first validates the input payload to ensure it contains the necessary data. 
// Then, it verifies the finisher token using a secret key. The code retrieves the exam details from a DynamoDB table and the exam questions from an S3 bucket. 
// It also retrieves the exam sessions from the database. It calculates the exam results for each session by comparing the user's answers with the correct answers. 
// The total points and the number of correct answers are calculated for each user. 
// The code updates the user's information in the database and the exam session status accordingly. 
// Finally, it returns a successful response if the process completes without errors, or an appropriate error response if any errors occur.
export const finishExam = async (payload: any): Promise<ExaminatorResponse> => {
  try {
    const _input = finisherExamInput.safeParse(payload)

    if (_input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: _input.error.issues } })
    }

    const { finisherToken } = _input.data

    const finishAuth = await validateFinishToken(finisherToken, FINISH_EXAM_TOKEN_SECRET)

    // *********
    // get exam from database
    // *********

    const examGetDB = await dynamo.send(
      new GetCommand({
        TableName: examsTableName,
        Key: {
          examId: finishAuth.examId,
        },
      }),
    )

    const exam = examGetDB.Item as ExamTableItem

    if (!exam) {
      throw new Response({ statusCode: 400, message: 'Invalid Exam ID !' })
    }

    // *********
    // get exam questions from s3
    // *********

    const s3_exam = await s3.send(
      new GetObjectCommand({
        Bucket: examinatorBucket,
        Key: getExamQuestionsS3Path(finishAuth.courseId, finishAuth.examId),
      }),
    )
    const examData: ExamS3Item = JSON.parse(await streamToString(s3_exam.Body as Readable))

    if (!examData) {
      throw new Response({ statusCode: 400, message: 'Invalid examData !' })
    }

    // *********
    // get exam sessions from database
    // *********

    const _examSession = await dynamo.send(
      new QueryCommand({
        TableName: examSessionsTableName,
        KeyConditionExpression: 'examId = :examId',
        ExpressionAttributeValues: {
          ':examId': finishAuth.examId,
        },
      }),
    )

    const examSessions = _examSession.Items as ExamSessionTableItem[]

    if (!examSessions || examSessions.length === 0) {
      throw new Response({ statusCode: 400, message: 'Invalid examSessions !' })
    }

    console.log('examSession', examSessions)

    // *********
    // calculate exam results for each session aka user session
    // *********

    // every userId has its own exam session
    for (const session of examSessions) {
      const { userId, userAnswers } = session
      let totalPoints = 0
      let totalCorrectAnswers = 0

      for (const [questionId, userAnswer] of Object.entries(userAnswers)) {
        const question = examData.examQuestions.find((question) => question.questionId === questionId)

        if (question) {
          const correctAnswer = question.correctOptionId

          if (userAnswer === correctAnswer) {
            totalPoints += question.points
            totalCorrectAnswers += 1
          }
        }
      }

      console.log(`userId: ${userId} totalPoints: ${totalPoints} totalCorrectAnswers: ${totalCorrectAnswers}`)

      const isPassed = totalPoints >= exam.minimumPassingScore
      const updateUserDBCommand = new UpdateCommand({
        TableName: usersTableName,
        Key: {
          userId: userId,
        },
        UpdateExpression: 'SET exams.#k.examStatus = :examStatus, exams.#k.isPassed = :isPassed, exams.#k.score = :score',
        ExpressionAttributeNames: {
          '#k': finishAuth.examId,
        },
        ExpressionAttributeValues: {
          ':examStatus': isPassed ? userExamStatus.enum.passed : userExamStatus.enum.failed,
          ':isPassed': isPassed,
          ':score': totalPoints,
        },
      })

      const updateExamSessionsTable = new UpdateCommand({
        TableName: examSessionsTableName,
        Key: {
          examId: finishAuth.examId,
          userId: userId,
        },
        UpdateExpression: 'SET userStatus = :examStatus, userIsPassed = :isPassed, userScore = :score',
        ExpressionAttributeValues: {
          ':examStatus': examStatus.enum.finished,
          ':isPassed': totalPoints >= exam.minimumPassingScore,
          ':score': totalPoints,
        },
      })

      await Promise.all([dynamo.send(updateUserDBCommand), dynamo.send(updateExamSessionsTable)])
    }

    return new Response({ statusCode: 200, body: { success: true } }).response
  } catch (error) {
    console.log(error)
    return error instanceof Response ? error.response : new Response({ statusCode: 400, message: 'Generic Examinator Error', addons: { error: error.message } }).response
  }
}

// This code handles the process of joining an exam. It first validates the access token and the input payload. 
// It checks if the user is enrolled in the course related to the exam and if the exam is valid and not canceled. 
// It retrieves the exam questions from an S3 bucket and randomizes them if required. If the user has already joined the exam, it returns the existing exam session data. 
// Otherwise, it creates a new exam session for the user, generates a token for the session, and updates the necessary tables. 
// Finally, it returns the token, the exam questions, and the exam details to the user.
export const joinExam = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }
    const _token = event.headers['access-token']

    const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)

    const _input = joinExamInput.safeParse(JSON.parse(event.body || '{}'))

    if (_input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: _input.error.issues } })
    }

    const { examId } = _input.data

    // **********
    // check if user is enrolled in course
    // **********

    const _user = await dynamo.send(
      new GetCommand({
        TableName: usersTableName,
        Key: {
          userId: auth.userId,
        },
      }),
    )

    const user = _user.Item as UsersTableItem

    if (!user) {
      throw new Response({ statusCode: 404, message: 'Couldnt find any user with this id', addons: { userId: auth.userId } })
    }

    // **********
    // check recived exam is valid
    // **********

    const examGetDB = await dynamo.send(
      new GetCommand({
        TableName: examsTableName,
        Key: {
          examId,
        },
      }),
    )

    const exam = examGetDB.Item as ExamTableItem

    if (!exam) {
      throw new Response({ statusCode: 400, message: 'This exam doesnt exist !', addons: { examId } })
    }

    if (auth.userType === 'student' && user.courses.find((course) => course.id === exam.courseId)) {
      throw new Response({ statusCode: 400, message: `You are not enrolled in ${exam.courseId} !` })
    }

    const now = dayjs()
    const _start = dayjs(exam.startDate)
    const _end = dayjs(exam.endDate)

    if (_start.isAfter(now)) {
      throw new Response({ statusCode: 400, message: `This exam is not started yet ! It will start at ${_start.format('YYYY-MM-DD HH:mm:ss')}` })
    }

    if (_end.isBefore(now)) {
      throw new Response({ statusCode: 400, message: `This exam is finished at ${_end.format('YYYY-MM-DD HH:mm:ss')} ! You cannot join anymore !` })
    }

    if (exam.examStatus === examStatus.enum.canceled) {
      throw new Response({ statusCode: 400, message: 'This exam is canceled ! You cannot join anymore !' })
    }

    // **********
    // fetch exam questions from s3
    // **********

    const s3_exam = await s3.send(
      new GetObjectCommand({
        Bucket: examinatorBucket,
        Key: getExamQuestionsS3Path(exam.courseId, examId),
      }),
    )

    const examData: ExamS3Item = JSON.parse(await streamToString(s3_exam.Body as Readable))
    // VERY IMPORTANT to remove correct option id from exam data
    examData.examQuestions = examData.examQuestions.map((question) => ({
      ...question,
      correctOptionId: undefined,
    }))

    // **********
    // Randomize questions and options if needed
    // **********

    if (exam.isQuestionsRandomized) {
      examData.examQuestions = examData.examQuestions
        .map((value) => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value)
    }

    if (exam.isOptionsRandomized) {
      for (const question of examData.examQuestions) {
        question.options = question.options
          .map((value) => ({ value, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ value }) => value)
      }
    }

    // **********
    // check if user has already joined this exam, if already joined skip later parts
    // **********

    const _examSession = await dynamo.send(
      new GetCommand({
        TableName: examSessionsTableName,
        Key: {
          examId,
          userId: auth.userId,
        },
      }),
    )

    const examSession = _examSession.Item as ExamSessionTableItem

    if (examSession) {
      // TODO dont send entire "exam" just send names 
      return new Response({ statusCode: 202, body: { token: examSession.userExamToken, examQuestions: examData.examQuestions, exam, userAnswers: examSession.userAnswers } }).response
    }

    // **********
    // user doesnt have exam session, create session and token, update tables
    // **********

    const tokenData: ExamTicketTokenMetaData = {
      examId,
      userId: auth.userId,
      courseId: exam.courseId,
    }

    const timeLeftToFinish = _end.diff(dayjs(), 'second')
    const userExamToken = sign(tokenData, EXAM_SESSION_TOKEN_SECRET, { expiresIn: timeLeftToFinish })

    const examSessions_PutCommand = new PutCommand({
      TableName: examSessionsTableName,
      Item: {
        examId,
        userId: auth.userId,
        userExamToken,
        userAnswers: {},
        userScore: 0,
        userIsPassed: false,
      } as ExamSessionTableItem,
    })

    const users_exam: UsersTableItemExam = {
      examId,
      examName: exam.name,
      courseId: exam.courseId,
      courseName: exam.courseName,
      startDate: exam.startDate,
      endDate: exam.endDate,
      duration: exam.duration,
      isCreator: false,
      examStatus: userExamStatus.enum.ongoing,
      isPassed: false,
      score: 0,
      totalPoints: exam.totalPoints,
    }

    const users_updateCommand = new UpdateCommand({
      TableName: usersTableName,
      Key: {
        userId: auth.userId,
      },
      UpdateExpression: 'SET exams.#k = :v',
      ExpressionAttributeNames: {
        '#k': examId,
      },
      ExpressionAttributeValues: {
        ':v': users_exam,
      },
    })

    const workes = [dynamo.send(examSessions_PutCommand), dynamo.send(users_updateCommand)]

    await Promise.all(workes)

    // **********

    // TODO dont send entire "exam" just send names 
    return new Response({ statusCode: 200, body: { token: userExamToken, examQuestions: examData.examQuestions, exam } }).response
  } catch (error) {
    console.log(error)

    return error instanceof Response ? error.response : new Response({ statusCode: 400, message: 'Generic Examinator Error', addons: { error: error.message } }).response
  }
}

// This code handles the submission of answers to an exam. 
// It validates the request, checks if the exam and user session are valid, and parses the submitted answer data. 
// It retrieves the exam details from a DynamoDB table and verifies if the exam is active and not finished or canceled. 
// It checks if the submitted question and option are valid for the exam. If all validations pass, it updates the user's answer for the specified question in the exam session record. 
// Finally, it returns a successful response if the submission is successful, or an appropriate error response if any issues occur during the process.
export const submitToExam = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const accessToken = event.headers['access-token']
    const examToken = event.headers['exam-token']

    const auth = await validateSessionToken(accessToken, ACCESS_TOKEN_SECRET)

    // this will handle -> is exam exist & is exam time ended
    const examAuth = await validateExamTicketToken(examToken, EXAM_SESSION_TOKEN_SECRET)

    if (examAuth.userId !== auth.userId) {
      throw new Response({ statusCode: 400, message: 'This exam session did not started by you cannot use this !', addons: { examAuth, auth } })
    }

    const _input = submitAnswerInput.safeParse(JSON.parse(event.body || '{}'))

    if (_input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: _input.error.issues } })
    }

    const { questionId, optionId } = _input.data

    const examDB = await dynamo.send(
      new GetCommand({
        TableName: examsTableName,
        Key: {
          examId: examAuth.examId,
        },
      }),
    )
    const exam = examDB.Item as ExamTableItem

    if (!exam) {
      throw new Response({ statusCode: 400, message: 'This exam doesnt exist !', addons: { examAuth } })
    }

    if (exam.examStatus === examStatus.enum.finished) {
      throw new Response({ statusCode: 400, message: 'This exam is finished ! You cannot submit answers anymore !' })
    }

    if (exam.examStatus === examStatus.enum.canceled) {
      throw new Response({ statusCode: 400, message: 'This exam is canceled ! You cannot submit answers anymore !' })
    }

    if (!exam.questionsMetaData[questionId] || !exam.questionsMetaData[questionId].includes(optionId)) {
      throw new Response({ statusCode: 400, message: 'This exam does not have this question or this question does not have this option !', addons: { examAuth, questionId, optionId } })
    }

    // ********************

    const params = {
      TableName: examSessionsTableName,
      Key: {
        examId: examAuth.examId,
        userId: examAuth.userId,
      },
      UpdateExpression: 'SET userAnswers.#k = :v',
      ExpressionAttributeNames: {
        '#k': questionId,
      },
      ExpressionAttributeValues: {
        ':v': optionId,
      },
    }

    await dynamo.send(new UpdateCommand(params))

    return new Response({ statusCode: 200, body: { success: true } }).response
  } catch (error) {
    console.log(error)
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}


// This code is responsible for fetching exams that are currently available for a specific user. 
// It validates the request, retrieves the user's information from a DynamoDB table, and determines the course IDs associated with the user. 
// It then queries the DynamoDB table for exams that match the course IDs and have not ended yet. 
// It collects the relevant exam details, excluding unnecessary information, and returns a successful response with the retrieved exams. 
// If any errors occur during the process, it returns an appropriate error response.
export const getExams = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _input = getExamsInput.safeParse(JSON.parse(event.body || '{}'))

    if (_input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: _input.error.issues } })
    }

    const accessToken = event.headers['access-token']
    const auth = await validateSessionToken(accessToken, ACCESS_TOKEN_SECRET)

    const _user = await dynamo.send(
      new GetCommand({
        TableName: usersTableName,
        Key: {
          userId: auth.userId,
        },
      }),
    )

    const user = _user.Item as UsersTableItem

    if (!user) {
      throw new Response({ statusCode: 404, message: 'Couldnt find any user with this id', addons: { userId: auth.userId } })
    }

    const targetCourseIds: string[] = user.courses.map((course) => course.id)

    const workers = []

    let currentTime = Date.now()

    for (const courseId of targetCourseIds) {
      const command = new QueryCommand({
        TableName: examsTableName,
        IndexName: 'courseIdIndex', // name of the GSI
        KeyConditionExpression: 'courseId = :courseId',
        FilterExpression: _input.data.type === 'finished' ? 'endDate < :currentTime' : 'endDate >= :currentTime',
        ExpressionAttributeValues: {
          ':courseId': courseId,
          ':currentTime': currentTime,
        },
      })
      workers.push(dynamo.send(command))
    }

    const reponses = await Promise.all(workers)

    const exams: any[] = []

    for (const response of reponses) {
      for (const item of response.Items) {
        const { questionsMetaData, isOptionsRandomized, isQuestionsRandomized, ...rest } = item
        exams.push(rest)
      }
    }

    return new Response({ statusCode: 200, body: { exams } }).response
  } catch (error) {
    console.log(error)
    return error instanceof Response ? error.response : new Response({ statusCode: 400, message: 'Generic Examinator Error', addons: { error: error.message } }).response
  }
}

export const getResults = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _input = getResultsInput.safeParse(JSON.parse(event.body || '{}'))

    if (_input.success === false) {
      throw new Response({ statusCode: 400, message: 'Woops! It looks like you sent us the wrong data. Double-check your request and try again.', addons: { issues: _input.error.issues } })
    }

    const { examId } = _input.data

    const accessToken = event.headers['access-token']
    const auth = await validateSessionToken(accessToken, ACCESS_TOKEN_SECRET)

    const examGetDB = await dynamo.send(
      new GetCommand({
        TableName: examsTableName,
        Key: {
          examId,
        },
      }),
    )

    const exam = examGetDB.Item as ExamTableItem

    if (!exam) {
      throw new Response({ statusCode: 400, message: 'This exam doesnt exist !', addons: { examId } })
    }

    const _examSession = await dynamo.send(
      new QueryCommand({
        TableName: examSessionsTableName,
        KeyConditionExpression: 'examId = :examId',
        ExpressionAttributeValues: {
          ':examId': examId,
        },
      }),
    )

    const examSessions = _examSession.Items as ExamSessionTableItem[]

    if (!examSessions || examSessions.length === 0) {
      throw new Response({ statusCode: 400, message: 'Invalid examSessions !' })
    }

    const results = []

    for (const session of examSessions) {
      const _user = await dynamo.send(
        new GetCommand({
          TableName: usersTableName,
          Key: {
            userId: session.userId,
          },
        }),
      )

      const user = _user.Item as UsersTableItem

      if (!user) continue

      const { userId, userScore, userIsPassed } = session

      results.push({ userId, userScore, userIsPassed, userFirstName: user.firstName, userLastName: user.lastName, universityPersonalId: user.universityPersonalId })
    }

    return new Response({ statusCode: 200, body: { exam, results } }).response
  } catch (error) {
    console.log(error)
    return error instanceof Response ? error.response : new Response({ statusCode: 400, message: 'Generic Examinator Error', addons: { error: error.message } }).response
  }
}
