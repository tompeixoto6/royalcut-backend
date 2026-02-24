// src/utils/slots.js
// Calcula horários disponíveis para uma data/barbeiro/serviço

/**
 * @param {object} params
 * @param {string} params.date           - "2024-12-20"
 * @param {string} params.scheduleStart  - "09:00"
 * @param {string} params.scheduleEnd    - "20:00"
 * @param {number} params.duration       - minutos do serviço
 * @param {Array}  params.existingBookings - [{startAt, endAt}]
 * @returns {Array} - lista de slots { time, available }
 */
export function generateSlots({ date, scheduleStart, scheduleEnd, duration, existingBookings }) {
  const SLOT_INTERVAL = 30 // minutos entre slots possíveis

  const [startH, startM] = scheduleStart.split(':').map(Number)
  const [endH, endM] = scheduleEnd.split(':').map(Number)

  const scheduleStartMin = startH * 60 + startM
  const scheduleEndMin = endH * 60 + endM

  const slots = []

  for (let min = scheduleStartMin; min + duration <= scheduleEndMin; min += SLOT_INTERVAL) {
    const slotStart = new Date(`${date}T${minutesToTime(min)}:00`)
    const slotEnd = new Date(`${date}T${minutesToTime(min + duration)}:00`)

    // Verificar conflito com reservas existentes
    const hasConflict = existingBookings.some(booking => {
      const bStart = new Date(booking.startAt)
      const bEnd = new Date(booking.endAt)
      return slotStart < bEnd && slotEnd > bStart
    })

    // Não mostrar slots no passado
    const isPast = slotStart < new Date()

    slots.push({
      time: minutesToTime(min),
      startAt: slotStart.toISOString(),
      endAt: slotEnd.toISOString(),
      available: !hasConflict && !isPast,
    })
  }

  return slots
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0')
  const m = (totalMinutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}
