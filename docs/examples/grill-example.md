# Grill 使用示例

## 场景：用户提供粗略目标

**用户输入**：
```
我想实现一个用户登录功能，需要与现有的认证系统集成。
```

## Grill Agent 五维深挖

### 维度 1：目标澄清

**Grill Agent**: 这个登录功能主要解决什么问题？是新用户注册后登录，还是已有用户的重复登录？

**用户**: 主要是已有用户的重复登录，新用户注册是另一个功能。

**Grill Agent**: 用户登录后需要访问哪些功能？

**用户**: 登录后可以查看个人资料、修改设置。

### 维度 2：边界确认

**Grill Agent**: 登录方式有哪些？邮箱密码？手机号？社交账号？

**用户**: 只需要邮箱密码登录，暂时不做社交登录。

**Grill Agent**: 是否需要"记住我"功能？忘记密码？

**用户**: 需要"记住我"，忘记密码这次不做。

### 维度 3：技术约束（Wayfinder 触发）

**Grill Agent**: 你提到"现有的认证系统"，让我看看现有架构...

**[调用 Wayfinder.exploreArchitecture("认证系统")]**

**Wayfinder 发现**：
- AuthService (`src/auth/service.ts`): 负责用户认证
- UserModel (`src/models/user.ts`): 用户数据模型
- JWTMiddleware (`src/middleware/jwt.ts`): JWT 令牌验证

**Grill Agent**: 现有系统使用 JWT 认证。新的登录功能需要：
- 调用 AuthService.login(email, password)
- 返回 JWT token
- 前端存储 token 用于后续请求

### 维度 4：验收标准细化

**Grill Agent**: 登录成功的标准是什么？

**用户**: 用户输入正确的邮箱密码后，跳转到首页。

**Grill Agent**: 登录失败的情况呢？

**用户**: 显示错误提示"邮箱或密码错误"。

**Grill Agent**: 是否需要防暴力破解？

**用户**: 是的，5 次失败后锁定账号 15 分钟。

### 维度 5：风险识别

**Grill Agent**: 可能的风险：
1. 密码明文传输？
2. JWT token 泄露？
3. 登录接口被暴力破解？

**用户**: HTTPS 传输，JWT 存储在 httpOnly cookie，后端实现速率限制。

## 生成的 mission.md

```markdown
# Mission: 用户登录功能

## 背景

- 现有系统：使用 AuthService + JWT 认证
- 用户痛点：需要登录访问个人功能
- 技术现状：已有 AuthService.login() 和 JWT 中间件

## 目标

实现用户登录功能，让已有用户可以用邮箱密码登录，并访问个人功能。

## 边界

✅ 做：邮箱密码登录，记住我功能，防暴力破解（5 次失败锁定 15 分钟）

❌ 不做：社交登录，忘记密码，新用户注册

## 成功标准

- [ ] 用户可以用正确的邮箱密码登录，跳转到首页
- [ ] 登录失败显示错误提示"邮箱或密码错误"
- [ ] "记住我"功能：勾选后 30 天内自动登录
- [ ] 5 次登录失败后，账号锁定 15 分钟
- [ ] JWT token 存储在 httpOnly cookie

## 架构约束

- 现有组件：
  - AuthService (`src/auth/service.ts`): 调用 login(email, password)
  - UserModel (`src/models/user.ts`): 用户数据模型
  - JWTMiddleware (`src/middleware/jwt.ts`): JWT 令牌验证
- 技术栈：HTTPS 传输，JWT 认证
- 安全约束：密码加密存储，速率限制防暴力破解

## 风险

⚠️ 风险 1：JWT token 泄露 → 使用 httpOnly cookie，设置合理过期时间

⚠️ 风险 2：暴力破解 → 后端实现速率限制（5 次失败锁定 15 分钟）

⚠️ 风险 3：密码安全 → 使用 bcrypt 加密，HTTPS 传输
```

## 后续流程

生成的 mission.md 会被 Mission Workflow 处理：
1. Mission Parser 解析
2. Investigator Agent 提取断言
3. Planner Agent 生成 features
4. Coverage Validator 验证覆盖
5. Worker 执行实现

## 对比：粗略目标 vs Grill 输出

### 粗略目标（用户原始输入）
```
我想实现一个用户登录功能，需要与现有的认证系统集成。
```

**问题**：
- 目标模糊：什么是"登录功能"？包含哪些具体能力？
- 边界不清：要不要做社交登录？要不要做忘记密码？
- 技术约束未知：现有认证系统是什么？如何集成？
- 验收标准缺失：如何判断"完成"？
- 风险未识别：可能遇到什么问题？

### Grill 输出（高质量 mission.md）

**改进**：
- ✅ 目标明确：邮箱密码登录，访问个人功能
- ✅ 边界清晰：做什么（登录、记住我、防暴力破解），不做什么（社交登录、忘记密码、注册）
- ✅ 技术约束具体：AuthService.login()，JWT token，httpOnly cookie
- ✅ 验收标准可验证：5 条明确断言，都可以通过测试验证
- ✅ 风险已识别：3 个风险 + 对应缓解措施

## Grill 价值总结

| 维度 | 粗略目标 | Grill 输出 | 价值 |
|------|---------|-----------|------|
| 需求理解 | "登录功能" | 邮箱密码登录 + 记住我 + 防暴力破解 | 避免返工 |
| 范围控制 | 无边界 | 明确 ✅ 做 / ❌ 不做 | 避免范围蔓延 |
| 技术对齐 | "集成现有系统" | AuthService.login() + JWT + httpOnly cookie | 架构一致性 |
| 可测性 | 无标准 | 5 条可验证断言 | 明确验收条件 |
| 风险管理 | 未识别 | 3 个风险 + 缓解措施 | 提前规避问题 |

**核心价值**：将"20% 信息"的粗略目标转化为"100% 信息"的高质量契约，为后续自动化流程提供坚实基础。
