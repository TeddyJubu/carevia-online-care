import {services as originalServices} from './content.js?v=34da789160';

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
export const services=originalServices.map(service=>({...service,...copy[service.id],image:`premium-blue/${blueImages[service.id]}`}));
