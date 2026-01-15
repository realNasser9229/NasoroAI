function getModelID(nasoroModel) {
  switch (nasoroModel) {
    case "nasoro-2-fast":
      return "xiaomi/mimo-v2-flash:free";
    case "nasoro-2":
      return "meta-llama/llama-3.3-70b-instruct:free";
    case "nasoro-2-pro":
      return "meta-llama/llama-3.3-70b-instruct:free";
    case "nasoro-2-chat":
      return "xiaomi/mimo-v2-flash:free";
    case "nasoro-2-coder":
      return "kwaipilot/kat-coder-pro-v1:free";
    case "nasoro-2-scientist":
      return "deepseek/deepseek-r1t2-chimera:free";
    case "nasoro-2-image":
      return "xiaomi/mimo-v2-flash:free";
    default:
      return "xiaomi/mimo-v2-flash:free";
  }
}
