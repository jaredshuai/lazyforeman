import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: false,
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "json-summary", "html"],
			exclude: [
				"node_modules/**",
				"test/**",
				"scripts/**",
				"**/*.test.ts",
				"**/*.config.ts",
				"dist/**",
			],
			include: ["src/**/*.ts"],
			all: true,
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 80,
				statements: 80,
			},
		},
	},
});
