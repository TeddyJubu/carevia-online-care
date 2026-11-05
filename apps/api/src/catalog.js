// Catalog copied from the patient-booking wireframe.
// Men’s health uses U+2019, the same apostrophe as that file.
// Schedule times are the three buttons on the wireframe schedule screen.

export const DEMO_DAYS = ['30 October 2026', '2 November 2026', '5 November 2026']
export const SLOT_TIMES = ['09:00', '11:30', '15:00']
export const SLOT_JOINER = ' \u00b7 '

const FIRST_NAMES = ['Emma', 'Lucas', 'Sofia', 'Noah', 'Amelia', 'Hugo', 'Clara', 'Leo', 'Ines', 'Oscar', 'Maya', 'Felix', 'Elena', 'Adam', 'Nora', 'Louis', 'Alice', 'Milan', 'Sara', 'Theo']
const LAST_NAMES = ['Laurent', 'Meyer', 'Martins', 'Rossi', 'Dubois', 'Silva', 'Weber', 'Costa', 'Moreau', 'Fischer', 'Romano', 'Pereira', 'Bernard', 'Schmidt', 'Almeida', 'Fontana', 'Petit', 'Andersson', 'Novak', 'Lindberg']
const LANGUAGE_SETS = ['English \u00b7 French', 'English \u00b7 German', 'Portuguese \u00b7 French', 'English \u00b7 Spanish', 'English \u00b7 Italian', 'German \u00b7 Portuguese', 'Spanish \u00b7 French']
const APPROACHES = [
  'A clear, collaborative consultation with time for your questions.',
  'Practical advice and continuity of care tailored to your needs.',
  'An attentive approach to understanding your symptoms and care goals.',
  'A supportive conversation focused on your next steps.',
]
const FEES = [45, 65, 85, 110]
const MONTHS = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
}

export const GROUPS = [
  {
    name: 'General & urgent care',
    blurb: 'General medicine, child care and common conditions',
    icon: 'stethoscope',
    services: [
      'Adult urgent care',
      'Paediatric urgent care',
      'Adult check-up',
      'Child consultation',
      'Respiratory infections',
      'Urinary infections',
      'Skin consultation',
      'Hair loss',
      'Pain',
      'Allergies',
      'Hypertension',
      'Contraception',
      'Men\u2019s health',
      'Sexology',
    ],
  },
  {
    name: 'Mental health',
    blurb: 'Psychology, psychiatry and ongoing support',
    icon: 'brain',
    services: [
      'Adult psychology',
      'Child psychology',
      'Psychiatry',
      'Child psychiatry',
      'Adult ADHD',
      'Child ADHD',
      'Autism',
      'Couples and family therapy',
      'Eating disorders',
      'Screen and gaming dependency',
      'Substance and behavioural dependencies',
      'Smoking cessation',
    ],
  },
  {
    name: 'Weight management',
    blurb: 'Nutrition and weight-loss consultations',
    icon: 'heart',
    services: ['Nutrition', 'Weight-loss consultation'],
  },
  {
    name: 'Specialist care',
    blurb: 'Find the right specialist for your needs',
    icon: 'activity',
    services: [
      'Gynaecology',
      'Neurology',
      'Endocrinology',
      'Rheumatology',
      'Paediatrics',
      'Migraine',
      'Menopause',
      'Breastfeeding',
      'Travel medicine',
    ],
  },
  {
    name: 'Certificates & assessments',
    blurb: 'Medical documents and fitness assessments',
    icon: 'file-check',
    services: [
      'Sick leave',
      'Illness certificate',
      'Nursery and school certificate',
      'Occupational certificate',
      'Driving fitness',
      'Driving fitness with psychotechnical assessment',
      'In-person psychotechnical assessment',
      'Hunting or firearms certificate',
      'Diving certificate',
      'Boating licence renewal',
    ],
  },
  {
    name: 'Treatments',
    blurb: 'Clinical advice and treatment review',
    icon: 'heart-pulse',
    services: [
      'Skin treatment',
      'Hair-loss treatment',
      'Pain management',
      'Allergies treatment',
      'Hypertension treatment',
      'Smoking cessation',
    ],
  },
  {
    name: 'Test requests & renewals',
    blurb: 'Doctor consultations for test requests and treatment renewals',
    icon: 'clipboard-list',
    services: ['Tests and laboratory investigations', 'Medical treatment renewal'],
  },
]

export function serviceSpecialty(group, service, variant) {
  const child = /Child|Paediatric|Nursery/.test(service)
  if (group === 0) {
    return child
      ? (variant % 2 ? 'Family medicine' : 'Paediatrics')
      : (variant % 2 ? 'Family medicine' : 'General practitioner')
  }
  if (group === 1) {
    if (/Psychiatry|ADHD|Autism/.test(service)) return child ? 'Child psychiatry' : 'Psychiatry'
    return variant % 2 ? 'Clinical psychology' : 'Psychology'
  }
  if (group === 2) return variant % 2 ? 'Clinical nutrition' : 'Dietetics'
  if (group === 3) {
    const specialties = {
      Gynaecology: 'Gynaecology',
      Neurology: 'Neurology',
      Endocrinology: 'Endocrinology',
      Rheumatology: 'Rheumatology',
      Paediatrics: 'Paediatrics',
      Migraine: 'Neurology',
      Menopause: 'Gynaecology',
      Breastfeeding: 'Family medicine',
      'Travel medicine': 'Travel medicine',
    }
    return specialties[service] || 'General medicine'
  }
  if (group === 4) return variant % 2 ? 'Medical assessments' : 'General practitioner'
  if (group === 5) {
    return /Skin|Hair/.test(service)
      ? 'Dermatology'
      : (variant % 2 ? 'Family medicine' : 'General practitioner')
  }
  return variant % 2 ? 'Family medicine' : 'General practitioner'
}

export function slotLabel(day, time) {
  return `${day}${SLOT_JOINER}${time}`
}

export function slotStartsAt(day, time) {
  const [dateText, monthName, yearText] = day.split(' ')
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(Date.UTC(Number(yearText), MONTHS[monthName], Number(dateText), hours, minutes))
}

export function buildDoctors() {
  const doctors = []
  let earlier = 0
  GROUPS.forEach((group, groupIndex) => {
    group.services.forEach((service, serviceIndex) => {
      for (let variant = 0; variant < 4; variant += 1) {
        const id = earlier + serviceIndex * 4 + variant
        const first = FIRST_NAMES[id % FIRST_NAMES.length]
        const last = LAST_NAMES[Math.floor(id / FIRST_NAMES.length) % LAST_NAMES.length]
        const specialty = serviceSpecialty(groupIndex, service, variant)
        const availabilityIndex = variant % 3
        doctors.push({
          id,
          name: `Dr ${first} ${last}`,
          initials: `${first[0]}${last[0]}`,
          groupId: groupIndex,
          service,
          specialty,
          languages: LANGUAGE_SETS[(serviceIndex + groupIndex + variant) % LANGUAGE_SETS.length],
          fee: FEES[variant],
          availabilityIndex,
          experience: `${5 + (id % 19)} years`,
          education: `Illustrative professional qualification and specialist training in ${specialty}`,
          approach: APPROACHES[variant],
          cedula: `DEMO-CEDULA-${id}`,
        })
      }
    })
    earlier += group.services.length * 4
  })
  return doctors
}

export function slotsForDoctor(doctor) {
  return DEMO_DAYS.slice(doctor.availabilityIndex).flatMap((day) =>
    SLOT_TIMES.map((time) => ({
      day,
      time,
      label: slotLabel(day, time),
      startsAt: slotStartsAt(day, time),
    })),
  )
}

export function languageTokens(languages) {
  return languages.split(SLOT_JOINER)
}
