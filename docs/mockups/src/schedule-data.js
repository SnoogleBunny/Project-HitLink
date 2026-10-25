// Shared daily timetable. Coaches, rooms and capacity are fictional demo records.
const demoClasses=[
 {id:'bootcamp',title:'HIIT Bootcamp',start:'07:15',end:'08:30',duration:75,program:'hiit',coach:'Sam Rivera',space:'Studio',capacity:20,places:8,level:0},
 {id:'hyrox',title:'HIIT/Hyrox',start:'16:30',end:'17:30',duration:60,program:'hiit',coach:'Sam Rivera',space:'Studio',capacity:20,places:6,level:0},
 {id:'padwork',title:'Beginner Padwork',start:'17:30',end:'18:30',duration:60,program:'padwork',coach:'Jordan Lee',space:'Mat 1',capacity:20,places:4,level:0},
 {id:'beginner-muay',title:'Beginner Muay Thai',start:'18:30',end:'19:30',duration:60,program:'muay',coach:'Jordan Lee',space:'Mat 1',capacity:20,places:1,level:0},
 {id:'advanced-muay',title:'Advanced Muay Thai',start:'18:30',end:'19:30',duration:60,program:'muay',coach:'Asha Singh',space:'Mat 2',capacity:20,places:3,level:1}
];
const demoClass=id=>demoClasses.find(item=>item.id===id)||demoClasses[3];
function demoTimeLabel(time){const [hour,minute]=time.split(':').map(Number);return `${hour%12||12}:${String(minute).padStart(2,'0')}${hour<12?'am':'pm'}`;}
const demoClassRange=item=>`${demoTimeLabel(item.start)}–${demoTimeLabel(item.end)}`;
const demoDays={mon:{label:'Mon',date:5},tue:{label:'Tue',date:6},wed:{label:'Wed',date:7},thu:{label:'Thu',date:8},fri:{label:'Fri',date:9},sat:{label:'Sat',date:10},sun:{label:'Sun',date:11},'next-mon':{label:'Mon',date:12}};
const demoDayLabel=day=>`${demoDays[day].label}, ${demoDays[day].date} Oct`;
const demoClassPlaces=(item,day)=>day==='sat'&&item.id==='padwork'?0:item.places;
