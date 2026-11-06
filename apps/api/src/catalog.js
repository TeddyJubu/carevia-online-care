// Catalog copied from the patient-booking wireframe.
// Men’s health uses U+2019, the same apostrophe as that file.
// The slot schedule is generated in src/schedule.js.

const LANGUAGE_JOINER = ' \u00b7 '

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
export const GROUPS = [
  {
    slug: 'general',
    name: 'General & urgent care',
    blurb: 'General medicine, child care and common conditions',
    fieldMarks: ["Something new in the last few days", "Fever, cough, infection, rash or minor injury", "Any age, from babies to adults"],
    confusedWith: "Specialist care: choose that for a known, ongoing condition.",
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
    slug: 'mental',
    name: 'Mental health',
    blurb: 'Psychology, psychiatry and ongoing support',
    fieldMarks: ["Low mood, anxiety, stress or poor sleep", "You’d like the same clinician each time", "Talking therapy or medication advice"],
    confusedWith: "Treatments: choose that if you only need a medication review.",
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
    slug: 'nutrition',
    name: 'Weight management',
    blurb: 'Nutrition and weight-loss consultations',
    fieldMarks: ["A planned change, not a sudden one", "Regular check-ins over weeks", "Nutrition plans you can follow at home"],
    confusedWith: "General & urgent care: for weight change you can’t explain.",
    icon: 'scale',
    services: ['Nutrition', 'Weight-loss consultation'],
  },
  {
    slug: 'specialist',
    name: 'Specialist care',
    blurb: 'Find the right specialist for your needs',
    fieldMarks: ["A known condition that needs an expert", "Gynaecology, neurology, endocrinology and more", "No referral needed"],
    confusedWith: "General & urgent care: for symptoms that are new.",
    icon: 'microscope',
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
    slug: 'certificates',
    name: 'Certificates & assessments',
    blurb: 'Fitness and health assessments with a doctor',
    fieldMarks: ["You need a document, not a diagnosis", "Sick leave, school or nursery fitness", "Usually 10 to 15 minutes"],
    confusedWith: "Test requests & renewals: for lab orders and results.",
    icon: 'file-check',
    services: [
      'Sick leave assessment',
      'Illness assessment',
      'Nursery and school fitness assessment',
      'Occupational fitness assessment',
      'Driving fitness assessment',
      'Driving fitness with psychotechnical assessment',
      'In-person psychotechnical assessment',
      'Hunting or firearms fitness assessment',
      'Diving fitness assessment',
      'Boating licence fitness assessment',
    ],
  },
  {
    slug: 'treatments',
    name: 'Treatments',
    blurb: 'Clinical advice and treatment review',
    fieldMarks: ["Skin, hair loss or ongoing pain", "Reviewing a treatment you’ve started", "Prescription is often the outcome"],
    confusedWith: "Specialist care: when you still need a diagnosis.",
    icon: 'pill',
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
    slug: 'renewals',
    name: 'Test requests & renewals',
    blurb: 'Doctor consultations for test requests and treatment renewals',
    fieldMarks: ["You already know what you need", "Lab tests or a repeat prescription", "Results arrive in your account"],
    confusedWith: "Certificates & assessments: for written statements.",
    icon: 'test-tube-diagonal',
    services: ['Tests and laboratory investigations', 'Treatment renewal review'],
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

export function languageTokens(languages) {
  return languages.split(LANGUAGE_JOINER)
}
