interface RewindCardPayload {
  yearLabel: string
  totals: {
    conversations: number
    messages: number
    words: number
  }
  mostUsedPlatform?: string
  topTopics?: string[]
  mostActiveMonth?: string
  labels?: {
    appName?: string
    subtitle?: string
    conversations?: string
    messages?: string
    words?: string
    topPlatform?: string
    mostActiveMonth?: string
    topTopics?: string
  }
}

function drawMetric(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number) {
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = '500 18px Inter, Arial, sans-serif'
  ctx.fillText(label, x, y)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 34px Inter, Arial, sans-serif'
  ctx.fillText(value, x, y + 38)
}

export async function exportRewindCard(payload: RewindCardPayload) {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 900
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')

  const labels = {
    appName: payload.labels?.appName || 'Rewind for AI Chats',
    subtitle: payload.labels?.subtitle || 'Your personal AI archive, wrapped into one shareable snapshot.',
    conversations: payload.labels?.conversations || 'Conversations',
    messages: payload.labels?.messages || 'Messages',
    words: payload.labels?.words || 'Words',
    topPlatform: payload.labels?.topPlatform || 'Top platform',
    mostActiveMonth: payload.labels?.mostActiveMonth || 'Most active month',
    topTopics: payload.labels?.topTopics || 'Top topics'
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  gradient.addColorStop(0, '#0f172a')
  gradient.addColorStop(0.5, '#312e81')
  gradient.addColorStop(1, '#7c3aed')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  for (let i = 0; i < 12; i += 1) {
    ctx.beginPath()
    ctx.arc(140 + i * 130, 120 + (i % 3) * 180, 90 + (i % 2) * 20, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#93c5fd'
  ctx.font = '600 24px Inter, Arial, sans-serif'
  ctx.fillText(labels.appName, 96, 90)

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 72px Inter, Arial, sans-serif'
  ctx.fillText(`${payload.yearLabel} Rewind`, 96, 180)

  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.font = '400 28px Inter, Arial, sans-serif'
  ctx.fillText(labels.subtitle, 96, 230)

  drawMetric(ctx, labels.conversations, String(payload.totals.conversations), 96, 340)
  drawMetric(ctx, labels.messages, String(payload.totals.messages), 420, 340)
  drawMetric(ctx, labels.words, String(payload.totals.words), 744, 340)

  const topics = (payload.topTopics || []).slice(0, 5)
  const topicRows = Math.max(1, Math.ceil(topics.length / 3))
  const cardY = 470
  const cardHeight = 228 + topicRows * 56

  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.roundRect(96, cardY, 1408, cardHeight, 28)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = '600 32px Inter, Arial, sans-serif'
  ctx.fillText(`${labels.topPlatform}: ${payload.mostUsedPlatform || '—'}`, 136, cardY + 70)
  ctx.fillText(`${labels.mostActiveMonth}: ${payload.mostActiveMonth || '—'}`, 136, cardY + 128)

  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = '500 24px Inter, Arial, sans-serif'
  ctx.fillText(labels.topTopics, 136, cardY + 188)

  ctx.font = '600 22px Inter, Arial, sans-serif'
  topics.forEach((topic, index) => {
    const chipX = 136 + (index % 3) * 350
    const chipY = cardY + 234 + Math.floor(index / 3) * 54
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.roundRect(chipX, chipY - 28, 300, 40, 20)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`#${topic}`, chipX + 18, chipY)
  })

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Failed to render the share card')

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `rewind-${String(payload.yearLabel).replace(/\s+/g, '-').toLowerCase()}.png`
  link.click()
  URL.revokeObjectURL(url)
}
