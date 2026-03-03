export const config = {
  defaultApiMode: import.meta.env.VITE_API_MODE || "mock",
  hosted: {
    rfDetectUrl: import.meta.env.VITE_RF_DETECT_URL || "",
    rfApiKey: import.meta.env.VITE_RF_API_KEY || "",
    smolvlmUrl: import.meta.env.VITE_SMOLVLM_URL || "",
    smolvlmApiKey: import.meta.env.VITE_SMOLVLM_API_KEY || ""
  },
  proxy: {
    detectUrl: "/api/detect",
    captionUrl: "/api/caption"
  }
};
