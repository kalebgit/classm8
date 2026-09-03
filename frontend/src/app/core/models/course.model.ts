import {Category, NewCategory} from './category.model'

export interface Course{
    id: number;
    name: string;
}

export interface CourseWithCategories extends Course{
    categories: Category[]
}

export interface NewCourse {
    name: string;
    categories: NewCategory[]
}