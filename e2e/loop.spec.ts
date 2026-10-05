import { createHash } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'

const CB = 'https://claude.ai/api/mcp/auth_callback'

async function claudeToken(page: import('@playwright/test').Page, request: APIRequestContext, base: string) {
  const reg = await (await request.post('/oauth/register', { data: { client_name: 'Claude', redirect_uris: [CB] } })).json()
  const verifier = 'v'.repeat(60)
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: CB, code_challenge: challenge, code_challenge_method: 'S256', state: 's', resource: `${base}/mcp` })
  await page.route('https://claude.ai/**', (r) => r.fulfill({ status: 200, body: 'ok' }))
  await page.goto(`/oauth/authorize?${q}`)
  const [req] = await Promise.all([page.waitForRequest((r) => r.url().startsWith(CB)), page.getByRole('button', { name: 'Cho phép' }).click()])
  const code = new URL(req.url()).searchParams.get('code')!
  const tok = await (await request.post('/oauth/token', { form: { grant_type: 'authorization_code', code, redirect_uri: CB, client_id: reg.client_id, code_verifier: verifier } })).json()
  return tok.access_token as string
}

async function tool(request: APIRequestContext, token: string, name: string, args: unknown) {
  const res = await request.post('/mcp', {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  })
  const line = (await res.text()).split('\n').find((l) => l.startsWith('data: '))!
  return JSON.parse(line.slice(6)).result as { isError?: boolean; content: { text: string }[] }
}

test('vòng Điều phối: web gửi lệnh → Claude nhận → báo kết quả → web cập nhật', async ({ page, baseURL }) => {
  await page.goto('/auth/dev?email=tutnv@bravebits.vn&name=Logan')
  await expect(page.getByText('Bàn điều phối').first()).toBeVisible()
  const token = await claudeToken(page, page.request, baseURL!)

  await page.goto('/')
  await page.locator('.strip', { hasText: 'upsell' }).getByRole('button', { name: 'Mở không gian riêng' }).click()
  await page.getByRole('tab', { name: /Lệnh/ }).click()
  await page.getByRole('button', { name: '+ Ghi chú cho Claude' }).click()
  await page.locator('.actbar__note').fill('Ưu tiên store gói Pro')
  await page.locator('.actbtn--run').click()
  await expect(page.locator('.ticket--pending').first()).toBeVisible()

  const d = await tool(page.request, token, 'dieu_phoi', {})
  const txt = d.content[0].text
  const viec = JSON.parse(txt.slice(txt.indexOf('{'))).viec as { leaseId: string; loai: string; task: { slug: string }; lenh?: { note: string } }[]
  const lenh = viec.find((v) => v.loai === 'lenh')!
  expect(lenh.lenh?.note).toBe('Ưu tiên store gói Pro')

  const r = await tool(page.request, token, 'bao_ket_qua', {
    slug: lenh.task.slug, status: 'ok', note: 'Đã gửi 12 tin', leaseId: lenh.leaseId,
    blocks: [{ id: 'ghi-chu', type: 'note', title: 'Ghi chú', data: { text: '<script>window.__xss = 1</script> **ổn**' } }],
  })
  expect(r.isError).toBeFalsy()
  const again = await tool(page.request, token, 'bao_ket_qua', { slug: lenh.task.slug, status: 'ok', leaseId: lenh.leaseId })
  expect(again.content[0].text).toContain('đã ghi trước đó')

  await page.reload()
  await page.locator('.strip', { hasText: 'upsell' }).getByRole('button', { name: 'Mở không gian riêng' }).click()
  await expect(page.locator('.blk__note')).toContainText('<script>')
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  await page.getByRole('tab', { name: /Lệnh/ }).click()
  await expect(page.locator('.ticket--done').first()).toContainText('Đã gửi 12 tin')
  await expect(page.getByText('Claude của bạn đang trực')).toBeVisible()
})

test('đồng nghiệp chỉ đọc; ⌘K tìm không dấu', async ({ page }) => {
  await page.goto('/auth/dev?email=tutnv@bravebits.vn&name=Logan')
  await page.keyboard.press('ControlOrMeta+k')
  await page.getByPlaceholder(/Tìm task/).fill('binh')
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Đang xem không gian của/)).toBeVisible()
  await page.getByRole('button', { name: 'Mở không gian riêng' }).first().click()
  await page.getByRole('tab', { name: /Lệnh/ }).click()
  await expect(page.locator('.actbar')).toHaveCount(0)
  await page.getByRole('button', { name: 'Lịch chạy' }).click()
  await expect(page.getByRole('switch')).toHaveCount(0)
})
