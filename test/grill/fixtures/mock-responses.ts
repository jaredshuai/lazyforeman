/**
 * Mock LLM responses for Grill Agent testing
 *
 * Phase 2.2 uses mock responses instead of real LLM calls.
 * Each dimension has pre-scripted responses that simulate a thorough
 * five-dimension drilling conversation.
 */

import { GrillDimension } from "../../../src/grill/types.js";

/**
 * Mock user responses for each Grill dimension
 */
export const mockGrillResponses: Record<GrillDimension, string> = {
	[GrillDimension.GOAL]: `The goal is to implement a user login feature for our web application.

Users: End users who need to access their accounts
How they'll use it: Visit /login page, enter email and password, click "Login"
Success criteria:
- Users can successfully authenticate with valid credentials
- Invalid credentials show clear error messages
- Session is established after successful login

Quantitative metrics:
- Login flow completes in < 2 seconds
- 95% success rate for valid credentials`,

	[GrillDimension.BOUNDARY]: `IN SCOPE:
- Email and password authentication
- Login form UI with email, password fields and submit button
- Backend /api/v1/login endpoint
- Session token generation (JWT)
- Password validation against database
- Clear error messages for wrong password/email

OUT OF SCOPE:
- Social login (Google, GitHub, etc.)
- Password reset functionality
- Multi-factor authentication
- Account registration (separate feature)
- Remember me checkbox

Dependencies:
- Existing user database (users table with email, hashed_password)
- bcrypt library for password hashing (already in package.json)

Known issues:
- Need to ensure timing-safe password comparison to prevent timing attacks`,

	[GrillDimension.TECHNICAL]: `Current architecture:
- Frontend: React 18 + TypeScript
- Backend: Node.js Express + TypeScript
- Database: SQLite with better-sqlite3
- Already have bcrypt@^5.0.1 in package.json
- Already have src/auth/hash.ts with hashPassword function

Existing components to reuse:
- src/auth/hash.ts: hashPassword, comparePassword functions
- src/db/connection.ts: database connection utilities
- Frontend components: FormInput, Button (in src/components/ui/)

Technical debt:
- No centralized error handling yet (need to add)
- No API middleware for request validation

Performance requirements:
- Login endpoint should respond in < 500ms
- Support 100 concurrent login requests

Security requirements:
- Passwords must be bcrypt hashed
- Use HttpOnly cookies for session tokens
- CSRF protection for login endpoint
- Rate limiting: max 5 failed attempts per IP per minute

Required tech stack:
- TypeScript strict mode
- Vitest for testing
- JWT for session tokens (jsonwebtoken library)`,

	[GrillDimension.ACCEPTANCE]: `Success criteria verification:

1. "Users can authenticate with valid credentials"
   - Automated test: Integration test with real database
   - Test cases: valid email+password, case-insensitive email
   - Edge cases: email with + character, unicode passwords
   - Done when: Test suite passes with 100% coverage

2. "Invalid credentials show clear error messages"
   - Automated test: Integration test checking response body
   - Test cases: wrong password, non-existent email, empty fields
   - Edge cases: SQL injection attempts, XSS in error messages
   - Done when: All error paths return appropriate messages

3. "Session established after login"
   - Automated test: Check JWT token in response cookie
   - Test cases: token contains user ID, token is valid for 24h
   - Edge cases: expired token rejection, malformed token rejection
   - Done when: Token validation tests pass

Acceptance thresholds:
- 100% test coverage for auth module
- All security edge cases tested
- Load test passes with 100 concurrent users`,

	[GrillDimension.RISK]: `Potential risks:

1. Security vulnerabilities
   - Risk: Password timing attacks, SQL injection, XSS
   - Impact: HIGH - could expose user accounts
   - Mitigation: Use timing-safe comparison, parameterized queries, input sanitization
   - Pre-research: Review OWASP top 10, audit bcrypt usage

2. Performance bottleneck
   - Risk: bcrypt hashing is slow, could block event loop
   - Impact: MEDIUM - slow login experience
   - Mitigation: Set bcrypt rounds to 10 (not 12), consider worker threads
   - Pre-research: Benchmark bcrypt performance with different round counts

3. Database schema mismatch
   - Risk: users table might not exist or have wrong columns
   - Impact: HIGH - blocking issue
   - Mitigation: Check schema before starting, create migration if needed
   - Pre-research: Inspect current database schema

4. JWT library incompatibility
   - Risk: jsonwebtoken might not be installed or have breaking changes
   - Impact: MEDIUM - need alternative solution
   - Mitigation: Check package.json, add if missing, pin version
   - Pre-research: Verify jsonwebtoken is in dependencies

5. CSRF protection complexity
   - Risk: Adding CSRF tokens might require significant refactoring
   - Impact: MEDIUM - delays feature delivery
   - Mitigation: Start with SameSite cookies, add CSRF tokens later
   - Pre-research: Review Express CSRF middleware options`,
};

/**
 * Mock mission.md generation from Grill conversation
 */
export const mockGeneratedMission = `# Mission: User Login Feature

## 背景
- Current web application has user accounts but no authentication mechanism
- Users need to access their accounts to view personalized content and settings
- Frontend uses React 18 + TypeScript, backend uses Express + SQLite

## 目标
Implement email and password authentication that allows users to securely log into their accounts with clear feedback on success or failure.

## 边界
✅ 做：
- Implement email and password authentication
- Create login form UI with email, password fields and submit button
- Develop backend /api/v1/login endpoint
- Generate session token using JWT
- Validate password against database
- Display clear error messages for authentication failures

❌ 不做：
- Social login integration (Google, GitHub, etc.)
- Password reset functionality
- Multi-factor authentication
- User account registration (separate feature)
- Remember me functionality

## 成功标准
- [ ] Users can authenticate successfully with valid email and password
- [ ] Invalid credentials return clear error messages without exposing security details
- [ ] Session token (JWT) is established after successful login
- [ ] Login flow completes in under 2 seconds for valid credentials
- [ ] System handles 100 concurrent login requests without degradation

## 架构约束
- 复用 src/auth/hash.ts 的 hashPassword 和 comparePassword 函数
- 复用 src/db/connection.ts 的数据库连接工具
- 复用 src/components/ui/ 的 FormInput 和 Button 组件
- 使用 TypeScript strict mode
- 使用 Vitest 测试框架
- 使用 bcrypt (已有 ^5.0.1) 进行密码哈希
- 使用 jsonwebtoken 生成 JWT tokens
- 会话 token 使用 HttpOnly cookies 存储
- bcrypt rounds 设置为 10 (性能考虑)
- 登录端点响应时间 < 500ms
- 实现速率限制：每 IP 每分钟最多 5 次失败尝试

## 风险
⚠️ 风险 1：安全漏洞（密码时序攻击、SQL 注入、XSS）
   - 影响：HIGH - 可能导致用户账户泄露
   - 缓解：使用时序安全比较、参数化查询、输入清理
   - 预研：审查 OWASP Top 10，审计 bcrypt 使用情况

⚠️ 风险 2：性能瓶颈（bcrypt 哈希计算阻塞事件循环）
   - 影响：MEDIUM - 登录体验缓慢
   - 缓解：bcrypt rounds 设为 10，考虑 worker threads
   - 预研：基准测试不同 rounds 的性能

⚠️ 风险 3：数据库 schema 不匹配（users 表可能不存在或字段错误）
   - 影响：HIGH - 阻塞问题
   - 缓解：开工前检查 schema，必要时创建迁移
   - 预研：检查当前数据库 schema

⚠️ 风险 4：JWT 库兼容性问题
   - 影响：MEDIUM - 需要替代方案
   - 缓解：检查 package.json，缺失则添加，固定版本
   - 预研：验证 jsonwebtoken 在 dependencies 中

⚠️ 风险 5：CSRF 保护复杂度
   - 影响：MEDIUM - 延迟功能交付
   - 缓解：先使用 SameSite cookies，后续添加 CSRF tokens
   - 预研：审查 Express CSRF middleware 选项`;

/**
 * Mock LLM client for testing
 */
export class MockLLMClient {
	private callCount = 0;
	private responses: string[];
	private roughGoal: string = "";

	constructor() {
		// Simulate conversation flow: dimension responses + final mission.md
		this.responses = [
			mockGrillResponses[GrillDimension.GOAL],
			mockGrillResponses[GrillDimension.BOUNDARY],
			mockGrillResponses[GrillDimension.TECHNICAL],
			mockGrillResponses[GrillDimension.ACCEPTANCE],
			mockGrillResponses[GrillDimension.RISK],
			mockGeneratedMission, // Final synthesis
		];
	}

	async chat(messages: any[]): Promise<string> {
		// Capture rough goal from first user message
		if (this.callCount === 0 && messages.length >= 2) {
			this.roughGoal = messages[1]?.content || "";
		}

		const response = this.responses[this.callCount % this.responses.length];
		this.callCount++;

		// Customize the final mission based on rough goal
		if (this.callCount === this.responses.length && this.roughGoal) {
			return this.customizeMission(response, this.roughGoal);
		}

		return response;
	}

	private customizeMission(template: string, roughGoal: string): string {
		// Simple customization: replace mission name if rough goal mentions specific feature
		if (roughGoal.toLowerCase().includes("registration")) {
			return template
				.replace("User Login Feature", "User Registration Feature")
				.replace("login", "registration")
				.replace("Login", "Registration")
				.replace("authenticate", "register")
				.replace("authentication", "registration");
		}
		return template;
	}

	getCallCount(): number {
		return this.callCount;
	}

	reset(): void {
		this.callCount = 0;
		this.roughGoal = "";
	}
}
