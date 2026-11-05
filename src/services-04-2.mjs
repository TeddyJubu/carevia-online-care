import {services as originalServices} from './content.mjs';

// Design 04.2's service labels and summaries, supplied in the service reference.
const copy={
 general:{name:'General & urgent care',short:'General medicine, child care and common conditions'},
 mental:{name:'Mental health',short:'Psychology, psychiatry and ongoing support'},
 nutrition:{name:'Weight management',short:'Nutrition and weight-loss consultations'},
 specialist:{name:'Specialist care',short:'Find the right specialist for your needs'},
 certificates:{name:'Certificates & assessments',short:'Fitness and health assessments with a doctor'},
 treatments:{name:'Treatments',short:'Clinical advice and treatment review'},
 renewals:{name:'Test requests & renewals',short:'Doctor consultations for test requests and treatment renewals'}
};

const blueImages={"general": "general-urgent-care", "mental": "mental-health", "nutrition": "weight-management", "specialist": "specialist-care", "certificates": "certificates-assessments", "treatments": "treatments", "renewals": "test-requests-renewals"};
// The services inside each area, shown when its folder opens in the all-care popup.
// ponytail: copied from GROUPS in apps/api/src/catalog.js; read /api/catalog instead once the homepage fetches live data.
const categories={
 general:['Adult urgent care','Paediatric urgent care','Adult check-up','Child consultation','Respiratory infections','Urinary infections','Skin consultation','Hair loss','Pain','Allergies','Hypertension','Contraception','Men\u2019s health','Sexology'],
 mental:['Adult psychology','Child psychology','Psychiatry','Child psychiatry','Adult ADHD','Child ADHD','Autism','Couples and family therapy','Eating disorders','Screen and gaming dependency','Substance and behavioural dependencies','Smoking cessation'],
 nutrition:['Nutrition','Weight-loss consultation'],
 specialist:['Gynaecology','Neurology','Endocrinology','Rheumatology','Paediatrics','Migraine','Menopause','Breastfeeding','Travel medicine'],
 certificates:['Sick leave assessment','Illness assessment','Nursery and school fitness assessment','Occupational fitness assessment','Driving fitness assessment','Driving fitness with psychotechnical assessment','In-person psychotechnical assessment','Hunting or firearms fitness assessment','Diving fitness assessment','Boating licence fitness assessment'],
 treatments:['Skin treatment','Hair-loss treatment','Pain management','Allergies treatment','Hypertension treatment','Smoking cessation'],
 renewals:['Tests and laboratory investigations','Treatment renewal review']
};
export const services=originalServices.map(service=>({...service,...copy[service.id],categories:categories[service.id],image:`premium-blue/${blueImages[service.id]}`}));
