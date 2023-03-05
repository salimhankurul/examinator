#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway'
import { Duration } from 'aws-cdk-lib'
import { Function, Architecture, Runtime, Code } from 'aws-cdk-lib/aws-lambda'
import { AttributeType, BillingMode, StreamViewType, Table } from 'aws-cdk-lib/aws-dynamodb'
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { DomainName, HttpApi, HttpMethod, HttpRoute, HttpRouteKey, PayloadFormatVersion } from '@aws-cdk/aws-apigatewayv2-alpha'
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager'

export class XorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const UserTable = new Table(this, 'UserTable', {
      partitionKey: {
        name: 'email',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      tableName: 'UserTable',
    })

    const SessionTable = new Table(this, 'SessionTable', {
      partitionKey: {
        name: 'userId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      timeToLiveAttribute: 'expiresAt',
      tableName: 'SessionTable',
    })

    const role = new Role(this, 'COSLambdaRole', {
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

    const testLambda = new Function(this, 'testLambda', {
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'index.test',
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(5),
      role,
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
      },
    })

    const registerLambda = new Function(this, 'registerLambda', {
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/authentication.register',
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(45),
      role,
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
        REFRESH_TOKEN_SECRET: 'REFRESH_TOKEN_SECRET',
      },
    })

    const signInLambda = new Function(this, 'signInLambda', {
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/authentication.signIn',
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(45),
      role,
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
        REFRESH_TOKEN_SECRET: 'REFRESH_TOKEN_SECRET',
      },
    })

    const signOutLambda = new Function(this, 'signOutLambda', {
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/authentication.signOut',
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(45),
      role,
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
      },
    })

    const refreshLambda = new Function(this, 'refreshLambda', {
      runtime: Runtime.NODEJS_16_X,
      code: Code.fromAsset('dist'),
      handler: 'Modules/authorization.refreshToken',
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(45),
      role,
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
        REFRESH_TOKEN_SECRET: 'REFRESH_TOKEN_SECRET',
      },
    })

    const httpApi = new HttpApi(this, 'XorServiceHttpAPI', {
      description: 'Service Http Api',
      createDefaultStage: true,
    })

    new HttpRoute(this, 'XorAPIRouteSignIn' + HttpMethod.POST, {
      httpApi,
      routeKey: HttpRouteKey.with('/SIGNIN', HttpMethod.POST),
      integration: new HttpLambdaIntegration('signInLambdanegration', signInLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRouteRegister' + HttpMethod.POST, {
      httpApi,
      routeKey: HttpRouteKey.with('/REGISTER', HttpMethod.POST),
      integration: new HttpLambdaIntegration('registerLambdaInegration', registerLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRouteRefresh' + HttpMethod.POST, {
      httpApi,
      routeKey: HttpRouteKey.with('/REFRESH', HttpMethod.POST),
      integration: new HttpLambdaIntegration('refreshLambdaInegration', refreshLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRouteSignOut' + HttpMethod.POST, {
      httpApi,
      routeKey: HttpRouteKey.with('/SIGNOUT', HttpMethod.POST),
      integration: new HttpLambdaIntegration('signOutLambdaInegration', signOutLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRouteTest' + HttpMethod.POST, {
      httpApi,
      routeKey: HttpRouteKey.with('/TEST', HttpMethod.POST),
      integration: new HttpLambdaIntegration('testLambdaInegration', testLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })
  }
}

const app = new cdk.App()
new XorStack(app, 'XorStack', {
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
