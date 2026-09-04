import Components from "unplugin-vue-components/vite";
import { AntDesignVueResolver } from "unplugin-vue-components/resolvers";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  ssr: false,
  devtools: { enabled: true },
  modules: ["@nuxt/eslint"],
  css: ["ant-design-vue/dist/reset.css"],
  runtimeConfig: {
    mysql: { host: "", port: 3306, database: "", user: "", password: "" },
    redis: { host: "", port: 6379, password: "", db: 0, url: "" },
    public: { appUrl: "http://localhost:3000" },
  },
  vite: {
    plugins: [
      Components({
        dts: "types/components.d.ts",
        resolvers: [AntDesignVueResolver({ importStyle: false })],
      }),
    ],
  },
});
