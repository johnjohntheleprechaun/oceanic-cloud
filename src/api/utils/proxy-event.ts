import {APIGatewayProxyEvent} from "aws-lambda";

/**
 * Util class for handling ambiguity in api gateway proxy events
 */
export class ProxyEvent {
    static getUserId(event: APIGatewayProxyEvent) {
        if (!event.requestContext.authorizer) {
            console.log("chicken nugget")
            return undefined;
        }
        if (typeof event.requestContext.authorizer.claims == "object") {
            return event.requestContext.authorizer.claims.sub;
        }
        else {
            return event.requestContext.authorizer.sub;
        }
    }
}
