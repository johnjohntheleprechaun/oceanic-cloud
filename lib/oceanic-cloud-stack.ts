import * as cdk from 'aws-cdk-lib';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import path = require('path');
import { OceanicUserPool } from './user-pool';
import { OceanicDocumentBucket } from './document-bucket';
import { OceanicApi } from './rest-api';

export const lambdaDefaults = {
    runtime: Runtime.NODEJS_20_X,
    architecture: Architecture.ARM_64,
    directory: path.join(__dirname, "functions")
}

export interface OceanicStackProps extends cdk.StackProps {
    isProd: boolean
    domainName?: string
    certArn?: string
    oAuthCallbacks: string[]
    logoutUrls: string[]
}
export class OceanicCloudStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: OceanicStackProps) {
        super(scope, id, props);

        // Storage resources
        const documents = new OceanicDocumentBucket(this, "oceanic-bucket", {
            isProd: props.isProd
        })
        const dynamoTable = new TableV2(this, "oceanic-db", {
            removalPolicy: props?.isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            partitionKey: { name: "user", type: cdk.aws_dynamodb.AttributeType.STRING },
            sortKey: { name: "dataType", type: cdk.aws_dynamodb.AttributeType.STRING },
        });

        // User pool definition
        const cognito = new OceanicUserPool(this, "oceanic-users", {
            isProd: props.isProd,
            callbackUrls: props.oAuthCallbacks,
            logoutUrls: props.logoutUrls,
            dynamoTable: dynamoTable,
            s3Bucket: documents.bucket
        });

        const api = new OceanicApi(this, "oceanic-api", {
            isProd: props.isProd,
            cognito,
            documents,
            database: dynamoTable,
            domainName: props.domainName,
            certArn: props.certArn
        });
    }
}
