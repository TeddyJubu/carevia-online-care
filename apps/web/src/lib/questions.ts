import { useEffect, useState } from 'react'

// The patient's own questions for the doctor. They stay on this device (localStorage) and are never sent to the API.
export type Question = { text: string; done: boolean }
const key = (id: string) => `carevia-questions-${id}`

export function readQuestions(id: string): Question[] {
  try { return JSON.parse(localStorage.getItem(key(id)) ?? '[]') } catch { return [] }
}

export function useQuestions(id: string): [Question[], (q: Question[]) => void] {
  const [list, setList] = useState<Question[]>(() => readQuestions(id))
  useEffect(() => setList(readQuestions(id)), [id])
  const save = (q: Question[]) => {
    setList(q)
    if (q.length) localStorage.setItem(key(id), JSON.stringify(q))
    else localStorage.removeItem(key(id))
  }
  return [list, save]
}
