const { HumanMessage, ToolMessage } = require('@langchain/core/messages')
const { BaseChatModel } = require('@langchain/core/language_models/chat_models')
const { createLlm } = require('./llm/llmFactory')
const { createGameTools } = require('./tools')
const { renderStateTable } = require('../game/state')
const { record } = require('../common/record')

class ReActAgent {
  constructor({ llm, state, interaction, script }) {
    this.state = state
    this.interaction = interaction
    this.script = script
    this.model = (llm instanceof BaseChatModel) ? llm : createLlm()
    this.tools = createGameTools(state, interaction)
    this.runnable = null
    this.messages = []
  }

  async init() {
    const { createStorytellerLlm } = require('./storytellerLlm')
    const helper = createStorytellerLlm()

    this.messages = helper.buildInitialMessages({
      stateText: renderStateTable(this.state),
      script: this.script
    })

    // Bind tools to the model
    this.runnable = this.model.bindTools(this.tools)
  }

  async loop() {
    if (!this.runnable) await this.init()

    record('info', 'Agent 启动游戏循环...')
    
    // Initial trigger
    this.messages.push(new HumanMessage("游戏开始。请按照流程主持首个夜晚。"))

    let gameEnded = false

    try {
      while (!gameEnded) {
        // Call LLM
        const result = await this.runnable.invoke(this.messages)
        this.messages.push(result)

        // Check for tool calls
        if (result.tool_calls && result.tool_calls.length > 0) {
          record('tool', '工具调用:')
          for (const call of result.tool_calls) {
            record('tool', `- ${call.name} ${JSON.stringify(call.args)}`)
            
            // Find tool
            const tool = this.tools.find(t => t.name === call.name)
            let output = ''
            if (tool) {
              try {
                // Execute tool
                // DynamicStructuredTool.func is the implementation
                // But invoke is the standard entry point, but func is internal?
                // DynamicStructuredTool has .invoke()
                output = await tool.invoke(call.args)
              } catch (e) {
                output = `Error: ${e.message}`
              }
            } else {
              output = `Error: Tool ${call.name} not found`
            }

            // Create ToolMessage
            this.messages.push(new ToolMessage({
              content: typeof output === 'string' ? output : JSON.stringify(output),
              tool_call_id: call.id,
              name: call.name
            }))

            // Check game over
            // Now we need to parse the argument to check command_type because we have combined tools
            let args = {}
            try {
               args = typeof call.args.argument === 'string' ? JSON.parse(call.args.argument) : call.args
            } catch {}
            
            // Check if it's game_over command
            // Note: call.args.command_type might be available if the model outputted it correctly as part of the structure
            // But DynamicStructuredTool might have already parsed it if it was simple JSON
            // But here our schema is { command_type, argument }
            // So call.args should have command_type
            if (call.name === 'grimoire_tool' && call.args.command_type === 'game_over') {
              gameEnded = true
            }
          }
        } else {
          // No tool calls, just text
          const text = result.content
          record('llm', `AI: ${text}`)
          
          if (text.includes("GAME_OVER")) {
            gameEnded = true
          } else {
            // If the agent stopped without tools, we nudge it to continue
            // Unless it's just a thought trace?
            // But if it's a thought trace, usually it comes WITH tool calls in OpenAI models.
            // If it's separate, it means it's done for this turn.
            
            // We append a prompt to continue.
            this.messages.push(new HumanMessage("请继续。如果需要玩家操作，请使用message_tool的ask命令。如果不需要，请推进流程。"))
          }
        }
      }
    } catch (e) {
      record('error', `Agent Loop Error: ${e.message}`)
      console.error(e)
    }
  }
}

module.exports = { ReActAgent }
