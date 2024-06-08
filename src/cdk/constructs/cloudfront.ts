import { AllowedMethods, CachePolicy, Distribution, OriginRequestPolicy, ResponseHeadersPolicy } from "aws-cdk-lib/aws-cloudfront";
import { Construct } from "constructs";
import { OceanicApi } from "./rest-api";
import { OceanicDocumentBucket } from "./document-bucket";
import { HttpOrigin, RestApiOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { OceanicUserPool } from "./user-pool";
import { Stack } from "aws-cdk-lib";

export interface OceanicDistributionProps {
    isProd: boolean;
    restApi: OceanicApi;
    bucket: OceanicDocumentBucket;
    userPool: OceanicUserPool;
}

export class OceanicDistribution extends Construct {
    distribution: Distribution;
    constructor (scope: Construct, id: string, props: OceanicDistributionProps) {
        super(scope, id);
        this.distribution = new Distribution(this, "distribution", {
            defaultBehavior: {
                origin: new RestApiOrigin(props.restApi.api),
                allowedMethods: AllowedMethods.ALLOW_ALL,
                cachePolicy: CachePolicy.CACHING_DISABLED,
            },
            additionalBehaviors: {
                "/auth": {
                    origin: new HttpOrigin(`cognito-idp.${Stack.of(this).region}.amazonaws.com`),
                    cachePolicy: CachePolicy.CACHING_DISABLED,
                    allowedMethods: AllowedMethods.ALLOW_ALL,
                    originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
                    responseHeadersPolicy: ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS
                }
            }
        });
    }
}