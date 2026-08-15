# 统一异常处理与错误码规范

业务异常必须走「领域异常 + 统一错误码 + 全局处理器」。**业务代码只抛异常，不转 HTTP（或其他传输协议）。**

文件归属（按项目实际结构调整路径，职责不变）：

- 错误码定义：集中在一个纯常量模块（如 `core/error_codes.py`）
- 异常基类：领域层公共模块（如 `domain/common/exceptions.py`）
- 全局处理器：表现层入口统一注册（如 `core/exception_handlers.py`）

---

## 一、铁律

1. **Controller/Router 禁止手写异常转换型 try/except**。异常直接冒泡，由全局处理器统一转协议响应。
2. **领域层禁止 import 表现层概念**（HTTPException、Response 等）。异常只依赖 `ErrorCode` 这个纯枚举。
3. **一个异常一个类**，禁止用大而全的 `BizError(code="xxx")` 传字符串码。
4. **异常定义在领域层**（`domain/<模块>/exceptions.py` 或实体内），应用层 import 复用，禁止重复定义同名异常。
5. **只有前端需要程序化识别的错误才新增专用错误码**；其余用通用基类默认码 + 具体消息。

---

## 二、异常基类（领域层公共模块）

| 基类 | 默认错误码 | HTTP | 用途 |
|------|-----------|------|------|
| `DomainError(Exception)` | E2002 INVALID_PARAMETER | 400 | 业务规则违反、参数非法 |
| `DomainNotFoundError(DomainError, LookupError)` | E2000 RESOURCE_NOT_FOUND | 404 | 资源不存在 |
| `DomainForbiddenError(DomainError, PermissionError)` | E1003 FORBIDDEN | 403 | 无权限 |
| `DomainConflictError(DomainError)` | E2001 RESOURCE_ALREADY_EXISTS | 409 | 资源冲突/重复 |
| `UpstreamUnavailableError(DomainError)` | E1040 UPSTREAM_UNAVAILABLE | 503 | 外部依赖不可用 |

处理器按异常类型 MRO 自动匹配，状态码取自 `exc.error_code.status_code`。
裸 `ValueError`/`LookupError`/`PermissionError` 也分别兜底为 400/404/403，不会误报 500。

入参校验失败（由校验框架自动触发）使用 `E2004 VALIDATION_ERROR / 422`，由全局处理器接管，无需定义异常类。

---

## 三、标准写法

### 1) 一般业务错误 —— 直接继承基类，不绑码

```python
# domain/order/exceptions.py
from app.domain.common.exceptions import DomainError, DomainNotFoundError

class OrderNotFoundError(DomainNotFoundError):
    pass                              # 自动 E2000 / 404

class OrderNotCancellableError(DomainError):
    pass                              # 自动 E2002 / 400
```

```python
# application/use_cases.py
if order is None:
    raise OrderNotFoundError(f"订单 {order_id} 不存在")
if order.is_paid:
    raise OrderNotCancellableError("已支付订单不可取消")
```

### 2) 需要前端识别的错误 —— 绑专用码

```python
# 1. 错误码模块加码（按号段分配，见第四节）
ORDER_ALREADY_PAID = ("E2050", "订单已支付，不能重复支付", 409)

# 2. 异常类绑定
class OrderAlreadyPaidError(DomainConflictError):
    error_code = ErrorCode.ORDER_ALREADY_PAID

# 3. 直接抛
raise OrderAlreadyPaidError()        # 用默认消息
raise OrderAlreadyPaidError("订单 xxx 已支付")  # 覆盖消息，码/状态不变
```

### 3) 无权限 / 认证失败 / 上游故障

```python
class NotOrderOwnerError(DomainForbiddenError):
    pass                              # E1003 / 403

class InvalidCredentialsError(DomainError):
    error_code = ErrorCode.INVALID_CREDENTIALS   # E1020 / 401

class PaymentGatewayError(UpstreamUnavailableError):
    pass                              # E1040 / 503
```

### 4) Controller/Router —— 零异常处理

```python
@router.post("/{order_id}/pay")
async def pay_order(order_id: str,
                    use_cases: OrderUseCases = Depends(get_order_use_cases)):
    result = await use_cases.pay(order_id)      # 异常自动冒泡
    return success_response(data=result)
```

---

## 四、错误码格式与号段分配

```
E1xxx 系统级（鉴权/权限/上游）   E2xxx 业务级   E3xxx 数据库/基础设施
三元组：(码值, 默认消息, HTTP状态码)
```

号段分配原则（新项目在码表文件中登记各模块占用区间，避免冲突）：

| 原则 | 说明 |
|------|------|
| 按类分段 | 系统级 E1xxx、业务级 E2xxx、数据层 E3xxx，跨类不复用 |
| 系统级细分 | E1000–E1009 保留给通用系统错误（FORBIDDEN 等基类默认码），认证、权限、上游依赖各预留一个十位段 |
| 按模块预留 | 每个模块预留连续 10 个号（如 E2010–E2019 给模块 A，E2020–E2029 给模块 B） |
| 新模块续段 | 新业务模块从码表登记的下一个空闲段开始，禁止插缝占用 |
| 通用段保留 | E2000–E2009 保留给通用业务错误（参数、不存在、冲突等基类默认码） |
| 只增不改 | 已发布的码值和含义不可变更，废弃标记 deprecated 而非复用 |

---

## 五、反模式

```python
# ❌ Controller 里手写转换
try:
    await use_cases.do()
except OrderNotFound as e:
    raise NotFoundException(str(e), ErrorCode.RESOURCE_NOT_FOUND)

# ❌ except Exception 吞掉未知异常（会把 bug 伪装成业务错误）
except Exception:
    raise BadRequestException("操作失败")

# ❌ 领域层 import 表现层
from fastapi import HTTPException
class XxxError(HTTPException): ...

# ❌ 为每个错误都发专用码（前端不读就是死码）
```

---

## 六、响应结构

异常统一返回（字段名可按项目约定调整，语义保持一致）：

```json
{
  "success": false,
  "message": "订单已支付，不能重复支付",
  "error_code": "E2050",
  "details": {}
}
```

入参校验框架（如 Pydantic / class-validator）的校验失败由全局处理器统一转换为对应错误码（如 `E2004 / 422`），无需在各接口手写。

---

## 七、提交前自检

以下为 Python 项目示例，路径与引用方式按项目实际调整：

```bash
# 查死码：定义了但全局无引用的错误码
grep -oE '^[[:space:]]*[A-Z_]+ = \("E[0-9]+"' <错误码文件> | awk '{print $1}' | while read name; do
  count=$(grep -rn "ErrorCode.$name\b" --include="*.py" . | grep -v <错误码文件> | wc -l | tr -d ' ')
  [ "$count" = "0" ] && echo "死码: $name"
done

# 查 Controller/Router 残留手写异常转换
grep -rn "except.*Error" <路由目录> --include="*.py"
```

说明：错误码通常定义在类（如 `ErrorCode`）内部带缩进，故匹配允许前导空白并用 `awk` 取名；循环最后一项判断为假时整段退出码为 1，属正常现象。

---

**约束生效条件：** 本文件通过 `@.claude/standards/errors.md` 注入 CLAUDE.md，在每次会话中自动加载。编码执行阶段（阶段3）的所有异常处理与错误码相关产出必须遵守上述约束。
