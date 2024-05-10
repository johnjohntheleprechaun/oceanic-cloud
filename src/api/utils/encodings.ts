export function toBase64(data: Uint8Array): string {
    return btoa(String.fromCharCode(...Array.from(data)));
}

export function fromBase64(data: string): Uint8Array {
    return new Uint8Array(Array.from(atob(data), (char) => char.charCodeAt(0)));
}