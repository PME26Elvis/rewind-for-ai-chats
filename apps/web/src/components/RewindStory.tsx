import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { prettyPlatformName } from '../lib/browserArchiveStore'
import { useI18n } from '../i18n'

const COPY_BANK: Record<string, Record<string, string[]>> = {
  en: {
    intro: [
      'Not every prompt is just a question. Some are plans, pivots, and midnight sparks.',
      'This rewind turns your imported chats into a yearbook for your AI thinking.',
      'From quick prompts to deep rabbit holes, this is the shape of your AI year.'
    ],
    platform: [
      'One platform clearly became your home base.',
      'When things got real, you kept coming back here.',
      'Your archive says this platform earned the most trust.'
    ],
    topics: [
      'Certain ideas kept echoing across your sessions.',
      'These topics show up like fingerprints across your archive.',
      'Your top themes were impossible to miss.'
    ],
    compare: [
      'Compared with the previous year, your archive shifted in a very visible way.',
      'The delta tells a story too — how much more, or less, you leaned on AI.',
      'This is where your momentum really shows.'
    ],
    finale: [
      'Your archive is more than history. It is a map of how you think.',
      'Every imported thread adds a little more shape to your personal AI memory.',
      'The best part of a rewind is realizing how much you already built.'
    ]
  },
  'zh-TW': {
    intro: [
      '不是每一次 prompt 都只是問答，有些其實是靈感、規劃與反覆推敲。',
      '這份 Rewind，把你分散在各平台的 AI 對話重新拼成一段完整的回顧。',
      '從隨手提問到深度研究，這就是你這段時間的 AI 使用軌跡。'
    ],
    platform: [
      '有一個平台，很明顯成了你的主場。',
      '當問題開始變得重要時，你最常回到這裡。',
      '你的聊天紀錄顯示，這個平台是你最信任的夥伴。'
    ],
    topics: [
      '有些主題一再出現，像是你思考軌跡留下的指紋。',
      '你的高頻主題非常鮮明，幾乎一眼就能看出來。',
      '這些關鍵詞，構成了你這段時間最核心的關注方向。'
    ],
    compare: [
      '和前一年相比，你的使用節奏出現了很明顯的變化。',
      '不只是總量改變，連使用方式也開始有了自己的風格。',
      '把今年和去年放在一起看，你的成長軌跡就變得很清楚。'
    ],
    finale: [
      '這不只是聊天紀錄，而是你如何思考、規劃與創造的軌跡。',
      '每一次匯入，都是把你的 AI 記憶拼圖再補上一塊。',
      'Rewind 最有趣的地方，是讓你看見自己其實已經走了多遠。'
    ]
  },
  'zh-CN': {
    intro: [
      '不是每一次 prompt 都只是问答，有些其实是灵感、规划与反复推敲。',
      '这份 Rewind，把你分散在各平台的 AI 对话重新拼成一段完整的回顾。',
      '从随手提问到深度研究，这就是你这段时间的 AI 使用轨迹。'
    ],
    platform: [
      '有一个平台，很明显成了你的主场。',
      '当问题开始变得重要时，你最常回到这里。',
      '你的聊天记录显示，这个平台是你最信任的伙伴。'
    ],
    topics: [
      '有些主题一再出现，像是你思考轨迹留下的指纹。',
      '你的高频主题非常鲜明，几乎一眼就能看出来。',
      '这些关键词，构成了你这段时间最核心的关注方向。'
    ],
    compare: [
      '和前一年相比，你的使用节奏出现了很明显的变化。',
      '不只是总量改变，连使用方式也开始有了自己的风格。',
      '把今年和去年放在一起看，你的成长轨迹就变得很清楚。'
    ],
    finale: [
      '这不只是聊天记录，而是你如何思考、规划与创造的轨迹。',
      '每一次导入，都是把你的 AI 记忆拼图再补上一块。',
      'Rewind 最有趣的地方，是让你看见自己其实已经走了多远。'
    ]
  }
}

function pickCopy(locale: string, section: keyof typeof COPY_BANK.en, seed: string) {
  const bank = COPY_BANK[locale] || COPY_BANK.en
  const list = bank[section] || COPY_BANK.en[section]
  const index = Math.abs(seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % list.length
  return list[index]
}

function StorySlide({ title, kicker, body, accent, value }: { title: string; kicker: string; body: string; accent: string; value?: string }) {
  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.5 }}
      className="max-w-4xl mx-auto px-8"
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/80 mb-6">
        <Sparkles className="w-4 h-4" /> {kicker}
      </div>
      <h2 className="text-4xl md:text-6xl font-bold text-white leading-tight max-w-4xl">{title}</h2>
      <p className="mt-6 text-lg md:text-2xl text-white/80 max-w-3xl leading-relaxed">{body}</p>
      {value ? <div className={`mt-10 inline-flex rounded-3xl px-8 py-5 text-3xl md:text-5xl font-bold text-white bg-gradient-to-r ${accent}`}>{value}</div> : null}
    </motion.div>
  )
}

export function RewindStory({ onClose, stats, yearLabel }: { onClose: () => void; stats: any; yearLabel: string }) {
  const { locale } = useI18n()
  const seed = `${yearLabel}-${stats?.totals?.messages || 0}-${stats?.mostUsedPlatform || ''}`

  const slides = useMemo(() => {
    const introBody = pickCopy(locale, 'intro', `${seed}-intro`)
    const platformBody = pickCopy(locale, 'platform', `${seed}-platform`)
    const topicBody = pickCopy(locale, 'topics', `${seed}-topics`)
    const compareBody = pickCopy(locale, 'compare', `${seed}-compare`)
    const finaleBody = pickCopy(locale, 'finale', `${seed}-finale`)

    return [
      {
        kicker: `${yearLabel} Rewind`,
        title: locale === 'en' ? `Ready to relive ${yearLabel}?` : `${yearLabel} Rewind，準備好了嗎？`,
        body: introBody,
        accent: 'from-fuchsia-500 to-violet-600',
        value: `${stats?.totals?.conversations || 0} chats`
      },
      {
        kicker: 'Platform energy',
        title: locale === 'en' ? `${prettyPlatformName(stats?.mostUsedPlatform || '')} led the way.` : `${prettyPlatformName(stats?.mostUsedPlatform || '')} 成了你的主場。`,
        body: platformBody,
        accent: 'from-cyan-500 to-sky-600',
        value: `${stats?.platformShare?.[0] ? Math.round((stats.platformShare[0].value / Math.max(1, stats.totals.conversations)) * 100) : 0}%`
      },
      {
        kicker: 'Recurring themes',
        title: locale === 'en' ? `Your archive kept circling back to ${stats?.topTopics?.[0] ? `#${stats.topTopics[0]}` : 'a few clear ideas'}.` : `你的高頻主題，反覆指向 ${stats?.topTopics?.[0] ? `#${stats.topTopics[0]}` : '幾個鮮明方向'}。`,
        body: topicBody,
        accent: 'from-amber-500 to-orange-600',
        value: (stats?.topTopics || []).slice(0, 3).map((item: string) => `#${item}`).join(' · ') || '—'
      },
      {
        kicker: 'Compared with last year',
        title: locale === 'en' ? `The numbers changed — and so did your rhythm.` : '和前一年相比，你的節奏也變了。',
        body: compareBody,
        accent: 'from-emerald-500 to-teal-600',
        value: stats?.comparison ? `${stats.comparison.messagesDelta >= 0 ? '+' : ''}${stats.comparison.messagesDelta} msgs` : 'No prior year'
      },
      {
        kicker: 'Final frame',
        title: locale === 'en' ? `${yearLabel} in one glance.` : `${yearLabel}，一眼回看。`,
        body: finaleBody,
        accent: 'from-pink-500 to-rose-600',
        value: stats?.longestConversation ? `${stats.longestConversation.messageCount} msgs · ${stats.longestConversation.title}` : `${stats?.totals?.messages || 0} msgs`
      }
    ]
  }, [locale, seed, stats, yearLabel])

  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((value) => {
        if (value >= slides.length - 1) {
          window.clearInterval(timer)
          return value
        }
        return value + 1
      })
    }, 3200)
    return () => window.clearInterval(timer)
  }, [slides.length])

  return (
    <div className="fixed inset-0 z-50 bg-[#020617] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.35),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.25),_transparent_32%)]" />
      <button onClick={onClose} className="absolute top-6 right-6 z-10 rounded-full border border-white/15 bg-white/10 p-3 text-white/80 hover:bg-white/15 hover:text-white transition-colors">
        <X className="w-5 h-5" />
      </button>
      <div className="relative h-full flex items-center justify-center">
        <AnimatePresence mode="wait">
          <StorySlide key={index} {...slides[index]} />
        </AnimatePresence>
      </div>
      <div className="absolute bottom-10 inset-x-0 flex items-center justify-center gap-2">
        {slides.map((_, slideIndex) => (
          <span key={slideIndex} className={`h-2.5 rounded-full transition-all ${slideIndex === index ? 'w-10 bg-white' : 'w-2.5 bg-white/30'}`} />
        ))}
      </div>
    </div>
  )
}
