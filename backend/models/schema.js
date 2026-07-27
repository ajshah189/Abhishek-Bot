export const firebaseCollections = {
  users: 'users',
  tasks: 'tasks',
  events: 'events',
  calendar: 'calendar',
  reminders: 'reminders',
  notes: 'notes',
  journal: 'journal',
  habits: 'habits',
  expenses: 'expenses',
  projects: 'projects',
  contacts: 'contacts',
  memories: 'memories',
  conversationLogs: 'conversation_logs',
  documents: 'documents',
  files: 'files',
  settings: 'settings',
  notifications: 'notifications'
};

export const schemas = {
  user: {
    telegramId: String,
    username: String,
    firstName: String,
    lastName: String,
    createdAt: Date,
    updatedAt: Date,
    settings: {
      timezone: String,
      dailyPlannerTime: String,
      eveningReviewTime: String,
      locale: String
    }
  },
  task: {
    userId: String,
    title: String,
    description: String,
    deadline: Date,
    priority: String,
    status: String,
    estimatedDuration: Number,
    labels: [String],
    subtasks: [String],
    recurring: Boolean,
    recurrenceRule: String,
    createdAt: Date,
    updatedAt: Date,
    completedAt: Date
  },
  expense: {
    userId: String,
    amount: Number,
    currency: String,
    category: String,
    merchant: String,
    description: String,
    date: Date,
    paymentMethod: String,
    createdAt: Date
  },
  reminder: {
    userId: String,
    title: String,
    description: String,
    reminderTime: Date,
    type: String,
    recurring: Boolean,
    recurrenceRule: String,
    status: String,
    createdAt: Date
  },
  memory: {
    userId: String,
    category: String,
    key: String,
    value: String,
    context: String,
    frequency: String,
    createdAt: Date,
    updatedAt: Date
  },
  conversationLog: {
    userId: String,
    message: String,
    response: String,
    intent: String,
    timestamp: Date,
    metadata: Object
  }
};
