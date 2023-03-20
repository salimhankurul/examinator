#!/usr/bin/env node
import 'source-map-support/register'
import * as path from 'path'
import * as crypto from 'crypto'
import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway'
import { Duration } from 'aws-cdk-lib'
import { Function, Architecture, Runtime, Code, LayerVersion } from 'aws-cdk-lib/aws-lambda'
import { AttributeType, BillingMode, StreamViewType, Table } from 'aws-cdk-lib/aws-dynamodb'
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { DomainName, HttpApi, HttpMethod, HttpRoute, HttpRouteKey, PayloadFormatVersion } from '@aws-cdk/aws-apigatewayv2-alpha'
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager'
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3'

const createExamLambdaName = 'CreateExam'
const joinExamLambdaName = 'JoinExam'
const submitToExamLambdaName = 'SubmitToExam'

const getProfileLambdaName = 'GetProfile'
const updateProfileLambdaName = 'UpdateProfile'

const signUpLambdaName = 'SignUp'
const signInLambdaName = 'SignIn'
const signOutLambdaName = 'SignOut'

const refreshTokenLambdaName = 'RefreshToken'

// *******************************
// *******************************

const bucketName = 'examinator-bucket'
const authenticationsTableName = 'Authentications'
const userSessionsTableName = 'UserSessions'
const usersTableName = 'Users'
const examsTableName = 'Exams'
const examSessionsTableName = 'ExamSessions'

export class ExaminatorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // *******************************
    // *******************************
    // ************ LAYER  ***********
    // *******************************
    // *******************************

    const cloudObjectBucket = new Bucket(this, bucketName, {
      bucketName: bucketName,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  })

    // *******************************
    // *******************************
    // ************ LAYER  ***********
    // *******************************
    // *******************************

    const layer = new LayerVersion(this, 'ExaminatorLayer', {
      code: Code.fromAsset(path.join('temp', 'layer.zip'), {
        assetHash: getLayerHash('../app-package.json'),
      }),
      compatibleRuntimes: [Runtime.NODEJS_16_X],
      license: 'MIT',
      description: 'Node Modules',
    })

    // *******************************
    // *******************************
    // ********* DYNAMODB  ***********
    // *******************************
    // *******************************

    const authenticationTable = new Table(this, authenticationsTableName, {
      partitionKey: {
        name: 'email',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      tableName: authenticationsTableName,
    })

    const usersTable = new Table(this, usersTableName, {
      partitionKey: {
        name: 'userId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      tableName: usersTableName,
    })

    const SessionTable = new Table(this, userSessionsTableName, {
      partitionKey: {
        name: 'userId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      timeToLiveAttribute: 'expiresAt',
      tableName: userSessionsTableName,
    })

    const ExamsTable = new Table(this, examsTableName, {
      partitionKey: {
        name: 'examId',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'courseId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      tableName: examsTableName,
    })

    const ExamUsers = new Table(this, examSessionsTableName, {
      partitionKey: {
        name: 'examId',
        type: AttributeType.STRING,
      },
      sortKey: {
        name: 'userId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      tableName: examSessionsTableName,
    })

    // *******************************
    // *******************************
    // ************ ROLES  ***********
    // *******************************
    // *******************************

    const role = new Role(this, 'ExaminatorLambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    })

    if (role) {
      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['dynamodb:*', 'logs:*', 'events:*', 'lambda:*', 's3:*', 'cloudwatch:*', 'iam:*', 'cloudfront:*'],
        }),
      )
    }

    // *******************************
    // *******************************
    // ***** LAMBDA HANDLERS  ********
    // *******************************
    // *******************************

    const testLambda = new Function(this, 'testLambda', {
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'index.test',
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(5),
      role,
      layers: [layer],
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
      },
    })

    const getProfileLambda = new Function(this, getProfileLambdaName, {
      functionName: getProfileLambdaName,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/profile.getProfile',
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(5),
      role,
      layers: [layer],
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
      },
    })

    const updateProfileLambda = new Function(this, updateProfileLambdaName, {
      functionName: updateProfileLambdaName,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/profile.updateProfile',
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(5),
      role,
      layers: [layer],
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
      },
    })

    const signUpLambda = new Function(this, signUpLambdaName, {
      functionName: signUpLambdaName,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/authentication.signUp',
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(45),
      role,
      layers: [layer],
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
        REFRESH_TOKEN_SECRET: 'REFRESH_TOKEN_SECRET',
      },
    })

    const signInLambda = new Function(this, signInLambdaName, {
      functionName: signInLambdaName,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/authentication.signIn',
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(45),
      role,
      layers: [layer],
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
        REFRESH_TOKEN_SECRET: 'REFRESH_TOKEN_SECRET',
      },
    })

    const signOutLambda = new Function(this, signOutLambdaName, {
      functionName: signOutLambdaName,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/authentication.signOut',
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(45),
      role,
      layers: [layer],
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
      },
    })

    const refreshLambda = new Function(this, refreshTokenLambdaName, {
      functionName: refreshTokenLambdaName,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/authorization.refreshToken',
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(45),
      role,
      layers: [layer],
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
        REFRESH_TOKEN_SECRET: 'REFRESH_TOKEN_SECRET',
      },
    })

    const createExamLambda = new Function(this, createExamLambdaName, {
      functionName: createExamLambdaName,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/exam.createExam',
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(45),
      role,
      layers: [layer],
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
      },
    })

    const joinExamLambda = new Function(this, joinExamLambdaName, {
      functionName: joinExamLambdaName,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/exam.joinExam',
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(45),
      role,
      layers: [layer],
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
        EXAM_TOKEN_SECRET: 'EXAM_TOKEN_SECRET',
      },
    })

    const submitExamAnswerLambda = new Function(this, submitToExamLambdaName, {
      functionName: submitToExamLambdaName,
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/exam.submitAnswer',
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(45),
      role,
      layers: [layer],
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
        EXAM_TOKEN_SECRET: 'EXAM_TOKEN_SECRET',
      },
    })

    // *******************************
    // *******************************
    // ************* HTTP  ***********
    // *******************************
    // *******************************

    const httpApi = new HttpApi(this, 'ExaminatorServiceHttpAPI', {
      description: 'Service Http Api',
      createDefaultStage: true,
    })

    // *******************************
    // *******************************
    // ********* HTTP ROUTES  ********
    // *******************************
    // *******************************

    new HttpRoute(this, 'ExaminatorAPIRouteupdateProfileLambda' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/SET_PROFILE', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('updateProfileLambdanegration', updateProfileLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'ExaminatorAPIRoutegetProfileLambda' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/GET_PROFILE', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('getProfileLambdaanegration', getProfileLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'ExaminatorAPIRouteSignIn' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/SIGNIN', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('signInLambdanegration', signInLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'ExaminatorAPIRoutesignUp' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/SIGNUP', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('signUpLambdaInegration', signUpLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'ExaminatorAPIRouteRefresh' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/REFRESH', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('refreshLambdaInegration', refreshLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'ExaminatorAPIRouteSignOut' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/SIGNOUT', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('signOutLambdaInegration', signOutLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'ExaminatorAPIRouteSubmitExamAnswer' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/SUBMIT', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('submitExamAnswerLambdaInegration', submitExamAnswerLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'ExaminatorAPIRouteCreateExamLambda' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/CREATE', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('createExamLambdaInegration', createExamLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'ExaminatorAPIRouteJoinExamLambda' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/JOIN', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('joinExamLambdaInegration', joinExamLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'ExaminatorAPIRouteTest' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/TEST', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('testLambdaInegration', testLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })
  }
}

function getLayerHash(packagePath: string): string {
  const packageJson = require(require.resolve(path.join(packagePath)))
  if (!packageJson) throw new Error('Package json can not found!')

  return crypto.createHmac('sha256', '').update(JSON.stringify(packageJson)).digest('hex')
}

const app = new cdk.App()
new ExaminatorStack(app, 'ExaminatorStack', {
  env: { region: 'eu-west-1' }
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
})
app.synth()
