import type { PoolOptions } from "mysql2/promise";
import { APPROVED_DATABASE, DatabaseBoundaryError } from "./safety.ts";

export interface MysqlSettings {
  host: string;
  port: string | number;
  database: string;
  user: string;
  password: string;
  ssl?: string | boolean;
}

export function mysqlOptions(settings: MysqlSettings): PoolOptions {
  if (settings.database !== APPROVED_DATABASE)
    throw new DatabaseBoundaryError();
  const port = Number(settings.port);
  if (
    !settings.host ||
    !settings.user ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("MySQL配置不完整。");
  }
  if (
    settings.ssl !== undefined &&
    ![true, false, "", "true", "false"].includes(settings.ssl)
  ) {
    throw new Error("MySQL TLS配置无效。");
  }
  return {
    host: settings.host,
    port,
    database: settings.database,
    user: settings.user,
    password: settings.password,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
    connectTimeout: 10000,
    ssl:
      settings.ssl === true || settings.ssl === "true"
        ? { rejectUnauthorized: true }
        : undefined,
  };
}
