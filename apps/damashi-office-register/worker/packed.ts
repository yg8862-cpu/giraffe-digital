export type PackedFile = { type: string; encoding: "utf8" | "base64"; body: string }

// The deployed bundle can replace this with the built pages. Local trial reads dist through ASSETS.
export const packedAssets: Record<string, PackedFile> | null = null
