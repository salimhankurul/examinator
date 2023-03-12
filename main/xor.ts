#!/usr/bin/env node
import 'source-map-support/register'
import * as path from 'path'
import * as crypto from 'crypto'
import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway'
import { Aws, Duration } from 'aws-cdk-lib'
import { Function, Architecture, Runtime, Code, LayerVersion } from 'aws-cdk-lib/aws-lambda'
import { AttributeType, BillingMode, StreamViewType, Table } from 'aws-cdk-lib/aws-dynamodb'
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { DomainName, HttpApi, HttpMethod, HttpRoute, HttpRouteKey, PayloadFormatVersion } from '@aws-cdk/aws-apigatewayv2-alpha'
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import { Certificate, ICertificate } from 'aws-cdk-lib/aws-certificatemanager'
import { AllowedMethods, CacheCookieBehavior, CacheHeaderBehavior, CachePolicy, CacheQueryStringBehavior, CachedMethods, Distribution, OriginProtocolPolicy, OriginRequestHeaderBehavior, OriginRequestPolicy, OriginRequestQueryStringBehavior, OriginSslPolicy, PriceClass, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront'
import { HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins'

const AWS_GATEWAY_CERTIFICATE_ARN="arn:aws:acm:eu-west-1:710823991036:certificate/55a953f1-de02-430d-ace7-e89a8d041250"
const AWS_API_CERTIFICATE_ARN="arn:aws:acm:us-east-1:710823991036:certificate/10f8997b-bda4-4f5b-b52e-4a349c9d2ca4"
const XOR_DOMAIN='api.examinator.app'

export class XorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // *******************************
    // *******************************
    // ************ LAYER  ***********
    // *******************************
    // *******************************

    const layer = new LayerVersion(this, 'XorLayer', {
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

    const authenticationTable = new Table(this, 'AuthenticationTable', {
      partitionKey: {
        name: 'email',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      tableName: 'AuthenticationTable',
    })

    const profileTable = new Table(this, 'ProfileTable', {
      partitionKey: {
        name: 'userId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      tableName: 'ProfileTable',
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

    // *******************************
    // *******************************
    // ************ ROLES  ***********
    // *******************************
    // *******************************

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

    const getProfileLambda = new Function(this, 'getProfileLambda', {
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

    const updateProfileLambda = new Function(this, 'updateProfileLambda', {
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

    const signUpLambda = new Function(this, 'signUpLambda', {
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

    const signInLambda = new Function(this, 'signInLambda', {
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

    const signOutLambda = new Function(this, 'signOutLambda', {
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

    const refreshLambda = new Function(this, 'refreshLambda', {
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

    // *******************************
    // *******************************
    // ************* HTTP  ***********
    // *******************************
    // *******************************
    
    const XOR_CERT = Certificate.fromCertificateArn(this, 'AWSServiceDistributionCertificate', AWS_API_CERTIFICATE_ARN)
    const XOR_API_GW_CERT = Certificate.fromCertificateArn(this, 'AWSServiceGatewayCertificate', AWS_GATEWAY_CERTIFICATE_ARN)

    const httpApi = new HttpApi(this, 'XorServiceHttpAPI', {
      description: 'Service Http Api',
      createDefaultStage: true,
      defaultDomainMapping: {
        domainName: new DomainName(this, 'AWSAPIGatewayDomainName', {
          domainName: XOR_DOMAIN,
          certificate: XOR_API_GW_CERT,
        }),
      },
    })

    // *******************************
    // *******************************
    // ******** DISTRUBUTION  ********
    // *******************************
    // *******************************

    const origin = new HttpOrigin(
      `${httpApi.httpApiId}.execute-api.${Aws.REGION}.amazonaws.com`, {
      originSslProtocols: [OriginSslPolicy.TLS_V1_2],
      protocolPolicy: OriginProtocolPolicy.HTTPS_ONLY,
      httpPort: 443,
      keepaliveTimeout: Duration.seconds(60),
  })

    const xorApiDistribution = new Distribution(this, 'AWSApiDistribution', {
      priceClass: PriceClass.PRICE_CLASS_ALL,
      domainNames: [XOR_DOMAIN],
      certificate: XOR_CERT,
      defaultBehavior: {
        compress: true,
        cachedMethods: CachedMethods.CACHE_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        origin,
        cachePolicy: new CachePolicy(this, 'AWSServiceOriginCachePolicy', {
          cachePolicyName: 'AWSServiceOriginCachePolicy',
          minTtl: Duration.seconds(0),
          maxTtl: Duration.days(90),
          defaultTtl: Duration.seconds(0),
          cookieBehavior: CacheCookieBehavior.none(),
          headerBehavior: CacheHeaderBehavior.none(),
          queryStringBehavior: CacheQueryStringBehavior.denyList('_token'),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        }),
        originRequestPolicy: new OriginRequestPolicy(this, 'AWSServiceOriginRequestPolicy', {
          originRequestPolicyName: 'AWSServiceOriginRequestPolicy',
          headerBehavior: OriginRequestHeaderBehavior.all(),
          queryStringBehavior: OriginRequestQueryStringBehavior.all(),
        }),
      },
    })
    xorApiDistribution.node.addDependency(httpApi)
    
    // *******************************
    // *******************************
    // ********* HTTP ROUTES  ********
    // *******************************
    // *******************************

    new HttpRoute(this, 'XorAPIRouteupdateProfileLambda' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/SET_PROFILE', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('updateProfileLambdanegration', updateProfileLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRoutegetProfileLambda' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/GET_PROFILE', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('getProfileLambdaanegration', getProfileLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRouteSignIn' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/SIGNIN', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('signInLambdanegration', signInLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRoutesignUp' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/SIGNUP', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('signUpLambdaInegration', signUpLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRouteRefresh' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/REFRESH', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('refreshLambdaInegration', refreshLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRouteSignOut' + HttpMethod.ANY, {
      httpApi,
      routeKey: HttpRouteKey.with('/SIGNOUT', HttpMethod.ANY),
      integration: new HttpLambdaIntegration('signOutLambdaInegration', signOutLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRouteTest' + HttpMethod.ANY, {
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
