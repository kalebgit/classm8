import {Category, NewCategory} from './category.model'

export type RoundingMethod = 'trunc' | 'ceil' | 'half_up' | 'half_up_strict';

export interface Course{
    id: number;
    name: string;
    // ajustes de la pestaña Análisis
    extra_points: number;        // 0..5
    rounding_enabled: boolean;
    rounding_method: RoundingMethod;
}

export interface CourseWithCategories extends Course{
    categories: Category[]
}

export interface NewCourse {
    name: string;
    categories: NewCategory[]
}