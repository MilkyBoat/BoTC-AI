const { ROLE_RATIO } = require('../common/const')
const { renderScript } = require('../game/scriptLoader')
const { ChatArk } = require('./ark')
const { shuffleTokenMap } = require('../game/roleManager')

function createLlmAgent({ } = {}) {
  function buildNigntAgentMessages({ phase, role, stateSnapshot, script, targetSeat, timeLabel }) {
    const sys = `角色: 血染钟楼AI说书人
目标: 在游戏的夜晚按剧本与核心规则结算当前角色的行动
输出: 仅返回json对象 { "ops": [ { "type": string, "payload": object } ] }
定位: 从 stateSnapshot 找到当前行动角色的座位(优先 realRole=role.name, 否则 knownRole=role.name)
流程:
1) 若本夜不行动或该角色已死亡则返回空 ops
2) 若能力需要选择/确认, 使用 prompt_player(seat, ability) 询问该角色座位; 等待回应后继续
3) 根据回应与规则更新状态: 使用 add_token 或 remove_token (如 保护/中毒/干扰项/失去能力/死于今日 等)
4) 信息传递: 私密信息用 send_to_player; 公共事件用 broadcast。发送前对照注意事项逐一检查后再送出
5) 若满足游戏结束条件（没有存活恶魔或仅剩2人且其中一人为恶魔，或剧本定义的其他条件）则使用 gameover
6) 最后使用 end_role
注意:
**必须做到的核心原则**
- 告知玩家的信息要尽量最小化，不要复述技能内容，只提供数字、角色、状态等信息，尽量简化且不要解释
- 除非技能明确说明要公开告知，否则不要泄露隐藏信息给全体, 仅向相关玩家私密发送
- 醉酒/中毒/认知覆盖(如酒鬼/疯子)等状态下，玩家实际上没有技能，但说书人仍需执行相应提示与标记，需要欺骗玩家让他以为自己还有对应技能。玩家释放技能一定失败，得到的信息可对可错，但是优先给错误信息，除非完全不合理才给正确信息。
**尽量做到**
- 对于由你选择的技能，尽量随机并分布均匀，不要只挑选前几名玩家，例如调查员的技能
**知识与概念**
- 若技能描述为“选择一名玩家”，则可以选择所有人包括自己或死亡玩家，若技能描述为”选择一名存活玩家”，则只能选择存活玩家
- 大家围坐成一个圈，所以座位号最大的玩家和1号玩家是邻座的
- 初始是镇民和外来者角色的玩家属于善良阵营，初始是爪牙和恶魔角色的玩家属于邪恶阵营
- 魔典上有所有人的真实角色和全局状态图，技能“查看魔典”指查看这些信息
工具与使用场景:
- prompt_player: 当该角色需要做出选择(指向玩家、选择数字、确认一次性能力)
- send_to_player: 传递私密信息(角色标记、数字手势、是否包含恶魔等)
- broadcast: 公共信息(进入夜晚/白天、处决结果、死亡公告等)
- add_token/remove_token: 记录/清除状态(例如 保护/中毒/干扰项/失去能力/被提名/死于今日)。add_token 需同时提供来源角色字段 source，用于标记来源
- change_character: 改变角色状态(例如 成为恶魔 等)
- gameover: 满足结算结束条件时宣布胜利（包含胜利阵营/玩家与原因）
- end_role: 结束本角色结算
示例 ops JSON:
{
  "ops": [ // 这里包含所有工具的示例，但是实际使用时根据需要选择使用
    // 询问玩家进行选择，询问时遵循信息最小化原则，只询问座位号、角色等信息，不要透露任何技能信息
    { "type": "prompt_player", "payload": { "seat": 5, "roleName": "占卜师", "ability": "选择两名玩家" } },
    // 私密告知选择结果，信息最小化，不要透露技能内容，用最简单的描述告知结果
    { "type": "send_to_player", "payload": { "seat": 5, "message": "有恶魔" } },
    { "type": "send_to_player", "payload": { "seat": 3, "message": "0" } },
    // 添加状态：包含来源角色
    { "type": "add_token", "payload": { "seat": 3, "token": "保护", "source": "僧侣" } },
    // 改变角色：将指定座位的角色变为指定阵营的指定角色，如果来源技能无法改变阵营，则不要携带team字段，仅在new_known和new_real字段指定目标角色名称，如果新角色技能包含“你以为自己是xxx”，则在new_known字段指定xxx，在new_real字段填入真实身份
    { "type": "change_character", "payload": { "seat": 3, "team": "邪恶", "new_known": "小恶魔", "new_real": "小恶魔" } },
    // 公共广播
    { "type": "broadcast", "payload": { "kind": "phase", "value": "4号玩家声称自己是猎手向8号玩家开枪，无事发生" } },
    // 结束本角色行动，注意调用后你将无法与该玩家对话，如果你需要等待玩家选择，仅调用 prompt_player，在得到合适的回应后再调用 end_role
    { "type": "end_role" }
  ]
}`
    const user = `当前阶段: ${phase}
当前角色: ${role.name}
当前角色所属阵营: ${role.team}
当前角色能力: ${role.ability}
当前行动座位: ${typeof targetSeat === 'number' ? targetSeat : '未知'}
当前时间: ${timeLabel || '未知'}
基于当前角色能力，你(说书人)需要做的事情: ${phase === 'firstNight' ? role.firstNightReminder : role.otherNightReminder}
当前角色可以为场上添加的token: ${Array.isArray(role.reminders) ? role.reminders.join(',') : ''}
当前全场状态: ${JSON.stringify(stateSnapshot)}`
    const msgs = [{ role: 'system', content: sys }, { role: 'user', content: user }]
    if (script) msgs.push({ role: 'user', content: renderScript(script) })
    return msgs
  }
  async function invokeRoleOps(msgs) {
    const chat = new ChatArk({})
    process.stdout.write('LLM思考中...\n')
    const r = await chat.invoke(msgs)
    const txt = typeof r.content === 'string' ? r.content : JSON.stringify(r.content)
    process.stdout.write('LLM思考完成。\n')
    try {
      const o = JSON.parse(txt);
      return Array.isArray(o.ops) ? o.ops : []
    } catch {
      return []
    }
  }
  async function decideForRole({ phase, role, stateSnapshot, script }) {
    const msgs = buildNigntAgentMessages({ phase, role, stateSnapshot, script })
    return await invokeRoleOps(msgs)
  }
  async function decideAllocation({ playerCount, script, customRules }) {
    if (process.env.DEBUG === '1') {
      process.stdout.write(`[Debug]使用固定角色分配\n`)
      return {
        players: [
          { seat: 1, knownRole: '红唇女郎', realRole: '红唇女郎', tokens: [] },
          { seat: 2, knownRole: '洗衣妇', realRole: '洗衣妇', tokens: [] },
          { seat: 3, knownRole: '僧侣', realRole: '僧侣', tokens: [] },
          { seat: 4, knownRole: '小恶魔', realRole: '小恶魔', tokens: [] },
          { seat: 5, knownRole: '镇长', realRole: '镇长', tokens: [] },
          { seat: 6, knownRole: '厨师', realRole: '厨师', tokens: [] },
          { seat: 7, knownRole: '士兵', realRole: '士兵', tokens: [] },
          { seat: 8, knownRole: '图书管理员', realRole: '酒鬼', tokens: ['是酒鬼'] }
        ]
      }
    }
    function buildCandidates(raw) {
      const entries = Array.isArray(raw) ? raw : []
      const roles = entries.filter(x => x && x.id && x.team && x.id !== '_meta' && x.team !== 'traveler')
      const byTeam = { townsfolk: [], outsider: [], minion: [], demon: [] }
      for (const r of roles) {
        if (byTeam[r.team]) byTeam[r.team].push({ name: r.name, team: r.team, ability: r.ability })
      }
      const meta = entries.find(x => x && x.id === '_meta') || {}
      return { candidates: byTeam, meta }
    }
    const { candidates, meta } = buildCandidates(script)
    function extractSetupAdjustments(raw) {
      const entries = Array.isArray(raw) ? raw : []
      const list = []
      for (const r of entries) {
        if (!r || r.id === '_meta' || r.team === 'traveler') continue
        const ab = String(r.ability || '')
        const m = ab.match(/\[([^\]]+)\]/)
        if (m) list.push({ name: r.name, team: r.team, text: m[1] })
      }
      return list
    }
    const setupAdjust = extractSetupAdjustments(script)
    const base = ROLE_RATIO[playerCount] || {}
    const adjustLines = setupAdjust.length ? setupAdjust.map(a => `- ${a.name}(${a.team}): ${a.text}`).join('\n') : '- (本剧本不包含可影响初始比例的角色)'
    const sys = `角色: 血染钟楼AI说书人
任务: 根据玩家人数与剧本乱序随机分配角色, 并生成全局token图
输出: 仅返回json对象, 格式 { "players": [ { "seat": number, "knownRole": string, "realRole"?: string, "tokens": string[] } ] }
硬约束:
- 所有角色唯一分配 (同名角色不可重复)
- 阵营数量必须满足基础比例 (镇民/外来者/爪牙/恶魔)
- 仅可从候选角色列表中选择分配
初始比例特殊调整规则:
- 如果你决定初始角色中包含以下任意一个角色，你在按照初始比例分配角色之后，还需要按照对应角色技能描述的[]内的要求继续进行调整，对应的差额数量从镇民中扣除
${adjustLines}
一致性规则:
- 若技能描述包含“你以为自己是xxx”（认知覆盖类角色）, 则 knownRole 与 realRole 不一致, knownRole要按照角色能力描述分配；否则 knownRole=realRole
- 座位号从 1 到玩家总数连续分配
提示: 初始 tokens 请根据 setup 与开局信息最小化生成 (如 "是酒鬼"、必要的提醒等)`
    const userPayload = {
      playerCount,
      baseRatio: base,
      scriptName: meta && meta.name || '',
      candidates,
      require: { format: { players: [{ seat: 1, knownRole: '', realRole: '', tokens: [] }] } }
    }
    const user = JSON.stringify(userPayload)
    const msgs = [{ role: 'system', content: sys }, { role: 'user', content: user }]
    if (customRules) msgs.push({ role: 'user', content: customRules })
    process.stdout.write('LLM思考中...\n')
    const chat = new ChatArk({})
    const r = await chat.invoke(msgs)
    const txt = typeof r.content === 'string' ? r.content : JSON.stringify(r.content)
    process.stdout.write('LLM思考完成。\n')
    try {
      const obj = JSON.parse(txt)
      return shuffleTokenMap(obj)
    } catch {
      return null
    }
  }
  function buildDayCheckMessages({ stateSnapshot, script }) {
    const sys = `角色: 血染钟楼AI说书人
目标: 白天处决结束后进行一次胜利判定与必要的身份变更
输出: 仅返回json对象 { "ops": [ { "type": string, "payload": object } ] }
可用工具: 仅允许 gameover、end_role、change_character
说明: 若无胜利条件满足，请返回 end_role；若满足则返回 gameover（包含胜利阵营/玩家与原因）。若因处决触发身份变更（如红唇女郎成为恶魔），请先返回 change_character 再返回 end_role`
    const user = `当前全场状态: ${JSON.stringify(stateSnapshot)}`
    const msgs = [{ role: 'system', content: sys }, { role: 'user', content: user }]
    if (script) msgs.push({ role: 'user', content: renderScript(script) })
    return msgs
  }
  return { decideForRole, decideAllocation, buildRoleMessages: buildNigntAgentMessages, invokeRoleOps, buildDayCheckMessages }
}

module.exports = { createLlmAgent }