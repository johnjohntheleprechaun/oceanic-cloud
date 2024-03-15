import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Bucket, LifecycleRule } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface OceanicDocumentBucketProps {
    isProd: boolean
}

export class OceanicDocumentBucket extends Construct {
    bucket: Bucket;
    constructor (scope: Construct, id: string, props: OceanicDocumentBucketProps) {
        super(scope, id);
        new Bucket(this, "user-documents", {
            removalPolicy: props?.isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
            autoDeleteObjects: !props.isProd,
            enforceSSL: true,
            lifecycleRules: this.defineLifecycleRules()
        });
    }

    private defineLifecycleRules(): LifecycleRule[] {
        return [{
            abortIncompleteMultipartUploadAfter: Duration.days(1),
            enabled: true,
            expiredObjectDeleteMarker: true,
            noncurrentVersionExpiration: Duration.days(7),
        }]
    }
}