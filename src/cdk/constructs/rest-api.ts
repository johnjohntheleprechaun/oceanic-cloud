import { CognitoUserPoolsAuthorizer, Cors, LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from "constructs";
import { OceanicUserPool } from "./user-pool";
import { lambdaDefaults } from "../oceanic-cloud-stack";
import path = require("path");
import { TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { OceanicDocumentBucket } from "./document-bucket";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { parse } from "yaml";
import { openSync, readFileSync } from "fs";

interface OceanicApiProps {
    isProd: boolean;
    cognito: OceanicUserPool;
    documents: OceanicDocumentBucket;
    database: TableV2;
    domainName?: string;
    certArn?: string;
}

export class OceanicApi extends Construct {
    api: RestApi;
    apiVersion: string;
    private cognitoAuthorizer: CognitoUserPoolsAuthorizer;
    private database: TableV2;
    private documents: OceanicDocumentBucket;
    private cognito: OceanicUserPool

    constructor (scope: Construct, id: string, props: OceanicApiProps) {
        super(scope, id)
        // API definition
        this.apiVersion = "0.1.0";
        this.api = new RestApi(this, "rest-api", {
            retainDeployments: props.isProd,
            restApiName: `Oceanic ${props.isProd ? "Prod" : "Test"}`,
            deployOptions: {
                stageName: "v1"
            },
            domainName: (props?.domainName && props.certArn) ? {
                domainName: props.domainName,
                certificate: Certificate.fromCertificateArn(this, "cert-arn", props.certArn)
            } : undefined
        });
        /* this.cognitoAuthorizer = new CognitoUserPoolsAuthorizer(this, "cognito-authorizer", {
            cognitoUserPools: [ props.cognito.userPool ]
        }); */
        this.database = props.database;
        this.documents = props.documents;
        this.cognito = props.cognito;

        this.loadApiDefinition("src/api/definition.yml", "src/api/endpoints");
    }

    /**
     * Create an API from a custom OpenAPI file. To be clear, this is *not* the same as defining an API gateway with a file. This is fully custom, with the reason for using OpenAPI being easier documentation and better code organization.
     * @param baseApi The api to create endpoints on
     * @param templatePath The path of the OpenAPI template file
     * @param baseFunctionPath The base path for lambda function entrypoints in x-lambda-entry
     */
    loadApiDefinition(templatePath: string, baseFunctionPath: string) {
        const templateContent = readFileSync(templatePath).toString();
        const template = parse(templateContent);
        const functions: { [key: string]: NodejsFunction } = {};
        for (const resourcePath in template.paths) {
            const resourceDefinition = template.paths[resourcePath];

            if (resourceDefinition["x-generation-exclude"]) {
                // don't add this path at all
                continue;
            }
            
            // Create the resource
            const pathParts = resourcePath.split("/")
            for (let i = 0; i < pathParts.length; i++) {
                if (pathParts[i] === "") {
                    pathParts.splice(i, 1);
                }
            }
            console.log(pathParts);
            let resource = this.api.root;
            for (const part of pathParts) {
                const next = resource.getResource(part);
                if (!next) {
                    resource = resource.addResource(part);
                }
                else {
                    resource = next;
                }
            }

            for (const method in resourceDefinition) {
                // Extract path and name
                const entry = path.join(baseFunctionPath, resourceDefinition[method]["x-lambda-entry"]);
                const name = (resourceDefinition[method]["x-lambda-entry"] as string).replace("/", "-").replace(/.(js|ts)$/, "") + "-function";
                console.log(name);

                // Create lambda function
                let lambdaFunction: NodejsFunction;
                if (!functions[name]) {
                    lambdaFunction = new NodejsFunction(this, name, {
                        runtime: lambdaDefaults.runtime,
                        architecture: lambdaDefaults.architecture,
                        entry: entry
                    });
                    functions[name] = lambdaFunction;
                } else {
                    lambdaFunction = functions[name];
                }

                // Add it to the API
                const integration = new LambdaIntegration(lambdaFunction);
                resource.addMethod(method, integration);
            }
        }
    }
}