import { jwtDecode } from "jwt-decode";

const tokenRegex = /^(Bearer )?(.+)$/;
/**
 * Extract the token from an Auth header
 * @param headerValue can be either the raw token or "Bearer {token}"
 */
export function parseAuthHeader(headerValue: string): any {
    // extract the actual token
    const tokenMatch = headerValue.match(tokenRegex);
    if (tokenMatch){
        return tokenMatch[tokenMatch.length - 1];
    }
    else {
        throw new Error("Invalid token string");
    }
}