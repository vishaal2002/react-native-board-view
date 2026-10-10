import type { Task } from './data';

export const taskId = (task: Task) => task.id;
export const taskLabel = (task: Task) => task.title;
export const taskRank = (task: Task) => task.rank;
