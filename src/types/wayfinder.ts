/**
 * Wayfinder 探索结果统一格式
 */
export interface WayfinderResult {
	query: string;
	tool: "codegraph" | "codebase-memory" | "fast-context";
	results: Array<{
		file: string;
		snippet?: string;
		lineRange?: { start: number; end: number };
		relevance?: number;
		context?: string;
	}>;
	metadata: {
		totalResults: number;
		searchTimeMs: number;
		cached: boolean;
		rawOutput?: string; // 保留原始输出供调试
	};
}

/**
 * Wayfinder 配置
 */
export interface WayfinderConfig {
	projectPath: string;
	enableCache: boolean;
	cacheExpiryMs?: number; // undefined = never expire
	preferredTool?: "codegraph" | "codebase-memory" | "fast-context";
}
