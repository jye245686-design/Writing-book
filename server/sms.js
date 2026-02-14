/**
 * 短信发送模块（腾讯云短信）
 * 生产环境配置 TENCENT_SMS_* 后发送真实短信；未配置时仅返回 skipped，由 auth 走控制台/不发送逻辑。
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const secretId = process.env.TENCENT_SECRET_ID || process.env.TENCENTCLOUD_SECRET_ID
const secretKey = process.env.TENCENT_SECRET_KEY || process.env.TENCENTCLOUD_SECRET_KEY
const smsSdkAppId = process.env.TENCENT_SMS_SDK_APP_ID
const signName = process.env.TENCENT_SMS_SIGN_NAME
const templateId = process.env.TENCENT_SMS_TEMPLATE_ID

const isConfigured = !!(secretId && secretKey && smsSdkAppId && signName && templateId)

/** 国内手机号转为 E.164：+86xxxxxxxxxx */
function toE164(phone) {
  const s = String(phone).replace(/\s/g, '').trim()
  if (/^\+86/.test(s)) return s
  if (/^86\d{11}$/.test(s)) return `+${s}`
  if (/^0086\d+/.test(s)) return `+${s.slice(2)}`
  if (/^\d{11}$/.test(s)) return `+86${s}`
  return `+86${s}`
}

/**
 * 发送验证码短信（腾讯云 SendSms）
 * 模板参数：若模板为「您的验证码是{1}，5分钟内有效」则传 [code, "5"]；仅{1}则传 [code]
 * @param {string} phone 手机号
 * @param {string} code 验证码
 * @returns {Promise<{ success: true } | { skipped: true } | { error: string }>}
 */
export async function sendVerificationSms(phone, code) {
  if (!isConfigured) {
    return { skipped: true }
  }
  if (!phone || !code) {
    return { error: '手机号或验证码为空' }
  }

  try {
    const tencentcloud = require('tencentcloud-sdk-nodejs')
    const smsClient = tencentcloud.sms.v20210111.Client
    const client = new smsClient({
      credential: { secretId, secretKey },
      region: 'ap-guangzhou',
    })
    const params = {
      PhoneNumberSet: [toE164(phone)],
      SmsSdkAppId: smsSdkAppId,
      TemplateId: templateId,
      SignName: signName,
      TemplateParamSet: [String(code)],
    }
    const res = await client.SendSms(params)
    const list = res.SendStatusSet || []
    const status = list[0]
    if (status && status.Code === 'Ok') {
      return { success: true }
    }
    const errMsg = status ? (status.Message || status.Code) : (res.RequestId ? '发送失败' : '无返回状态')
    return { error: errMsg }
  } catch (err) {
    const msg = err.message || err.code || String(err)
    console.error('[sms] 腾讯云短信发送异常:', msg)
    return {
      error: err.code === 'AuthFailure.SignatureFailure' || err.code === 'AuthFailure.SecretIdNotFound'
        ? '短信服务配置错误，请检查密钥与权限'
        : msg,
    }
  }
}

export { isConfigured as isSmsConfigured }
