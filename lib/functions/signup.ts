import { APIGatewayProxyHandler } from "aws-lambda";
import { createUser } from "../utils/user";
import { toBase64 } from "../utils/encodings";

interface SignupRequest {
    username: string
    password: string
    publicKey: string
    privateKey: string
}

export const handler: APIGatewayProxyHandler = async (event) => {
    const request = JSON.parse(event.body||"") as SignupRequest;
    console.log(request);

    // hash password here
    const encoder = new TextEncoder()
    const decoded = encoder.encode(request.password);
    const passwordKey = await crypto.subtle.importKey("raw", decoded, "PBKDF2", false, ["deriveBits"]);
    console.log("imported password key");

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const iterations = 600000;
    const params: Pbkdf2Params = { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iterations };
    const hashBits = await crypto.subtle.deriveBits(params, passwordKey, 256);
    
    const passwordHash = `$PBKDF2$SHA-256$${toBase64(salt)}$${iterations}$${toBase64(new Uint8Array(hashBits))}`
    console.log(passwordHash);
    
    const user = await createUser(
        request.username,
        passwordHash,
        request.publicKey,
        request.privateKey
    );
    return {
        statusCode: 200,
        body: JSON.stringify(user)
    }
}
