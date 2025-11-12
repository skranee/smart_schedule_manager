/**
 * Миграция БД: добавление уникальных индексов для предотвращения дублей
 * 
 * Задачи:
 * 1. Удалить дубликаты задач (оставить самые ранние по createdAt)
 * 2. Добавить уникальные индексы для закреплённых приёмов пищи
 * 3. Добавить логику предотвращения дублирования в планах
 */

import mongoose from 'mongoose';
import { TaskModel, PlanModel } from '../models/index.js';
import dotenv from 'dotenv';

dotenv.config();

async function removeDuplicateTasks() {
  console.log('Удаление дублирующихся задач...');
  
  // Находим дубликаты задач с одинаковыми userId, date, title, start, end
  const duplicates = await TaskModel.aggregate([
    {
      $match: {
        fixedTime: { $exists: true, $ne: null }
      }
    },
    {
      $group: {
        _id: {
          userId: '$userId',
          title: '$title',
          start: '$fixedTime.start'
        },
        ids: { $push: '$_id' },
        createdAts: { $push: '$createdAt' },
        count: { $sum: 1 }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    }
  ]);
  
  let deletedCount = 0;
  
  for (const dup of duplicates) {
    // Сортируем по createdAt и оставляем самую раннюю
    const sorted = dup.ids
      .map((id: any, index: number) => ({ id, createdAt: dup.createdAts[index] }))
      .sort((a: any, b: any) => a.createdAt - b.createdAt);
    
    const toKeep = sorted[0].id;
    const toDelete = sorted.slice(1).map((item: any) => item.id);
    
    if (toDelete.length > 0) {
      await TaskModel.deleteMany({ _id: { $in: toDelete } });
      deletedCount += toDelete.length;
    }
  }
  
  console.log(`Удалено дублирующихся задач: ${deletedCount}`);
}

async function removeDuplicatePlans() {
  console.log('Проверка дублирующихся планов...');
  
  // План уже имеет уникальный индекс (userId + date)
  // Но проверим дубликаты taskId внутри одного плана
  const plans = await PlanModel.find();
  
  let updatedCount = 0;
  
  for (const plan of plans) {
    const taskIdSet = new Set<string>();
    const uniqueSlots = [];
    
    for (const slot of plan.slots) {
      const taskIdStr = slot.taskId.toString();
      if (!taskIdSet.has(taskIdStr)) {
        taskIdSet.add(taskIdStr);
        uniqueSlots.push(slot);
      }
    }
    
    if (uniqueSlots.length !== plan.slots.length) {
      plan.slots = uniqueSlots;
      await plan.save();
      updatedCount++;
    }
  }
  
  console.log(`Обновлено планов с дублями: ${updatedCount}`);
}

async function addUniqueIndexes() {
  console.log('Добавление уникальных индексов...');
  
  // Для задач с фиксированным временем: уникальность (userId, title, fixedTime.start)
  try {
    await TaskModel.collection.createIndex(
      { userId: 1, title: 1, 'fixedTime.start': 1 },
      { 
        unique: true, 
        sparse: true, // только для документов с fixedTime
        name: 'unique_fixed_time_task'
      }
    );
    console.log('Создан индекс: unique_fixed_time_task');
  } catch (error: any) {
    if (error.code === 11000) {
      console.log('Индекс unique_fixed_time_task уже существует');
    } else {
      console.error('Ошибка создания индекса:', error);
    }
  }
  
  console.log('Уникальные индексы добавлены');
}

async function main() {
  try {
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      throw new Error('MONGO_URI не установлен в .env');
    }
    
    await mongoose.connect(mongoUri);
    console.log('Подключено к MongoDB');
    
    await removeDuplicateTasks();
    await removeDuplicatePlans();
    await addUniqueIndexes();
    
    console.log('Миграция завершена успешно');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка миграции:', error);
    process.exit(1);
  }
}

main();

