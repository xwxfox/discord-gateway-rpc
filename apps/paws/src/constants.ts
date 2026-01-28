import type { Identify } from "./gateway/types";

export const DEFAULT_APPLICATION_ID = "1429085779367428219";

export const DEFAULT_IDENTITY: Omit<Identify, "token"> = {
  properties: {
    browser: "Samsung Family Hub Smart Refrigerator",
    device: "discord-gateway-rpc",
    os: "Linux",
  },
  compress: false,
  large_threshold: 100,
};
