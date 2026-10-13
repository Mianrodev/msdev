/**
 * Starting points per home-services trade: default colours, services and
 * common customer problems. Used to draft a site without AI, and given to
 * Claude as a hint so its copy stays on-trade.
 */
import type { IconName } from "./schema";

export interface Preset {
  industry: string;
  tradeNoun: string;
  match: RegExp;
  primary: string;
  dark: string;
  emergency: boolean;
  services: { title: string; description: string; icon: IconName }[];
  painPoints: string[];
}

export const PRESETS: Preset[] = [
  {
    industry: "Plumbing",
    tradeNoun: "plumber",
    match: /plumb|drain|pipe|sewer|water heater|rooter/i,
    primary: "#1673c9",
    dark: "#0b1424",
    emergency: true,
    services: [
      { title: "Emergency Plumbing", description: "Fast response for burst pipes, major leaks and backups, day or night.", icon: "clock" },
      { title: "Drain Cleaning", description: "Clear stubborn clogs in sinks, showers and main lines.", icon: "drop" },
      { title: "Water Heater Repair", description: "Repair and replacement for tank and tankless water heaters.", icon: "flame" },
      { title: "Leak Detection", description: "Find hidden leaks behind walls and under slabs before they spread.", icon: "search" },
      { title: "Pipe Repair", description: "Fix or replace damaged, corroded or burst pipes.", icon: "wrench" },
      { title: "Sewer Line Service", description: "Inspection, clearing and repair of main sewer lines.", icon: "truck" },
    ],
    painPoints: [
      "Water leaking inside your home",
      "Drains backing up again and again",
      "A toilet that overflows or won't stop running",
      "No hot water when you need it",
      "A bad smell coming from the drains",
      "A plumber who never showed up",
    ],
  },
  {
    industry: "HVAC",
    tradeNoun: "HVAC technician",
    match: /hvac|heat|cool|air ?con|a\/c|furnace|ac repair/i,
    primary: "#e0592a",
    dark: "#121826",
    emergency: true,
    services: [
      { title: "AC Repair", description: "Get cool air back fast with same-day diagnosis and repair.", icon: "snowflake" },
      { title: "Heating Repair", description: "Furnace and heat pump repairs to keep your home warm.", icon: "flame" },
      { title: "System Installation", description: "Right-sized, efficient systems installed cleanly.", icon: "home" },
      { title: "Maintenance Plans", description: "Seasonal tune-ups that prevent breakdowns and lower bills.", icon: "check" },
      { title: "Indoor Air Quality", description: "Filtration and humidity control for healthier air.", icon: "leaf" },
      { title: "Duct Services", description: "Duct cleaning, sealing and repair for even comfort.", icon: "wrench" },
    ],
    painPoints: [
      "The AC quits on the hottest day",
      "Some rooms are always too hot or too cold",
      "Energy bills keep climbing",
      "Strange noises or smells from the system",
      "The heat won't come on",
      "A contractor who never called back",
    ],
  },
  {
    industry: "Roofing",
    tradeNoun: "roofer",
    match: /roof|gutter|shingle/i,
    primary: "#c2410c",
    dark: "#16120f",
    emergency: true,
    services: [
      { title: "Roof Repair", description: "Leaks, missing shingles and storm damage repaired properly.", icon: "hammer" },
      { title: "Roof Replacement", description: "Full replacements with quality materials and clean job sites.", icon: "home" },
      { title: "Storm Damage", description: "Fast inspections and help with your insurance claim.", icon: "bolt" },
      { title: "Inspections", description: "Detailed roof inspections with photos and honest advice.", icon: "search" },
      { title: "Gutters", description: "Gutter installation, repair and guards.", icon: "drop" },
      { title: "Emergency Tarping", description: "Temporary protection to stop damage until repairs are done.", icon: "shield" },
    ],
    painPoints: [
      "Water stains on the ceiling",
      "Shingles missing after a storm",
      "Not knowing if insurance will cover it",
      "Pushy roofers chasing storms",
      "An old roof you're unsure about",
      "Quotes that keep changing",
    ],
  },
  {
    industry: "Electrical",
    tradeNoun: "electrician",
    match: /electric|wiring|panel|lighting/i,
    primary: "#d99a00",
    dark: "#14151a",
    emergency: true,
    services: [
      { title: "Electrical Repair", description: "Safe fixes for outlets, switches, breakers and wiring faults.", icon: "bolt" },
      { title: "Panel Upgrades", description: "Modern panels that handle today's power needs safely.", icon: "shield" },
      { title: "Lighting", description: "Indoor, outdoor and recessed lighting installed cleanly.", icon: "star" },
      { title: "EV Chargers", description: "Home EV charger installation done to code.", icon: "truck" },
      { title: "Generators", description: "Backup power installation and service.", icon: "home" },
      { title: "Inspections", description: "Safety inspections for buying, selling or peace of mind.", icon: "search" },
    ],
    painPoints: [
      "Breakers that keep tripping",
      "Flickering or dimming lights",
      "Outlets that are warm or don't work",
      "An old panel that can't keep up",
      "Worrying about fire safety",
      "Electricians who won't commit to a time",
    ],
  },
  {
    industry: "Landscaping",
    tradeNoun: "landscaper",
    match: /landscap|lawn|garden|tree|yard|irrigation/i,
    primary: "#2f8f46",
    dark: "#0f1a12",
    emergency: false,
    services: [
      { title: "Lawn Care", description: "Mowing, edging and seasonal care for a healthy lawn.", icon: "leaf" },
      { title: "Landscape Design", description: "Outdoor spaces designed around how you live.", icon: "home" },
      { title: "Hardscaping", description: "Patios, walkways and retaining walls built to last.", icon: "hammer" },
      { title: "Irrigation", description: "Sprinkler installation, repair and tune-ups.", icon: "drop" },
      { title: "Tree & Shrub Care", description: "Pruning, trimming and removal done safely.", icon: "shield" },
      { title: "Seasonal Cleanup", description: "Spring and fall cleanups that keep the yard tidy.", icon: "spray" },
    ],
    painPoints: [
      "Patchy, tired-looking grass",
      "Weeds taking over the beds",
      "No time to keep up with the yard",
      "Sprinklers that waste water",
      "Crews that don't show up on schedule",
      "An outdoor space you never use",
    ],
  },
  {
    industry: "Cleaning",
    tradeNoun: "cleaner",
    match: /clean|maid|janitor|pressure wash|carpet/i,
    primary: "#0e9aa7",
    dark: "#0d1b1e",
    emergency: false,
    services: [
      { title: "Home Cleaning", description: "Regular cleaning that keeps your home fresh.", icon: "spray" },
      { title: "Deep Cleaning", description: "Top-to-bottom cleaning for every corner.", icon: "star" },
      { title: "Move-In / Move-Out", description: "Spotless results for a smooth move.", icon: "truck" },
      { title: "Office Cleaning", description: "Reliable cleaning for workplaces of any size.", icon: "users" },
      { title: "Carpet Cleaning", description: "Lift stains and refresh carpets and rugs.", icon: "drop" },
      { title: "Window Cleaning", description: "Streak-free windows inside and out.", icon: "home" },
    ],
    painPoints: [
      "No time to clean after work",
      "Cleaners who rush or miss spots",
      "Different people every visit",
      "Worrying about who's in your home",
      "Harsh chemicals around kids and pets",
      "Cancelled appointments",
    ],
  },
  {
    industry: "Pest Control",
    tradeNoun: "pest control technician",
    match: /pest|termite|exterminat|rodent|bug/i,
    primary: "#4d7c0f",
    dark: "#12160d",
    emergency: false,
    services: [
      { title: "General Pest Control", description: "Treatments for ants, roaches, spiders and more.", icon: "shield" },
      { title: "Termite Control", description: "Inspection and treatment to protect your home.", icon: "home" },
      { title: "Rodent Removal", description: "Remove mice and rats and seal entry points.", icon: "search" },
      { title: "Mosquito Control", description: "Take back your yard with seasonal treatments.", icon: "leaf" },
      { title: "Bed Bug Treatment", description: "Thorough treatment with follow-up checks.", icon: "check" },
      { title: "Wildlife Removal", description: "Humane removal and exclusion.", icon: "truck" },
    ],
    painPoints: [
      "Bugs coming back after DIY sprays",
      "Signs of mice in the kitchen",
      "Worrying about termite damage",
      "Chemicals around kids and pets",
      "Not being able to enjoy the yard",
      "Companies that lock you into contracts",
    ],
  },
];

export const GENERIC: Preset = {
  industry: "Home Services",
  tradeNoun: "technician",
  match: /.^/,
  primary: "#2563eb",
  dark: "#0f172a",
  emergency: false,
  services: [
    { title: "Repairs", description: "Fast, reliable repairs done right the first time.", icon: "wrench" },
    { title: "Installations", description: "Professional installation with clean, careful work.", icon: "hammer" },
    { title: "Maintenance", description: "Regular care that prevents costly problems.", icon: "check" },
    { title: "Inspections", description: "Honest assessments with clear recommendations.", icon: "search" },
    { title: "Upgrades", description: "Modern upgrades that improve comfort and value.", icon: "star" },
    { title: "Free Estimates", description: "Clear, upfront pricing before any work begins.", icon: "dollar" },
  ],
  painPoints: [
    "Contractors who don't call back",
    "Surprise charges on the final bill",
    "Jobs that drag on for weeks",
    "A mess left behind",
    "Not knowing who to trust",
    "Problems that come back",
  ],
};

export function presetFor(industry: string, businessName: string, services: string): Preset {
  const text = `${industry} ${businessName} ${services}`;
  return PRESETS.find((p) => p.match.test(industry)) ?? PRESETS.find((p) => p.match.test(text)) ?? GENERIC;
}
