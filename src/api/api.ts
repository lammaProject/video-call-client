import axios from "axios";
import type { Room, User } from "./type.ts";

const $api = axios.create({
  baseURL: "http://localhost:8080",
  headers: {
    "Content-Type": "application/json",
  },
});

$api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

$api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // if (error.response?.status === 401) {
    //   localStorage.removeItem("token");
    //   window.location.href = "/auth";
    // }

    return Promise.reject(error);
  },
);

// USERS
export const getUsers = async () => {
  const { data } = await $api.get<User[]>("/users");
  return data;
};

export const getUser = async (name?: string) => {
  if (!name) {
    const { data } = await $api.get("/users");
    return data;
  }
  const { data } = await $api.get<User>(`/users/${name}`);
  return data;
};

export const registerUser = async (data: {
  name: string;
  password: string;
}) => {
  return await $api.post("/users/register", data); // Исправлено
};

export const loginUser = async (data: { name: string; password: string }) => {
  return await $api.post("/users/login", data);
};

// Profile
export const getProfile = async () => {
  const { data } = await $api.get<User>("/auth/profile");
  return data;
};

// Rooms
export const createRoom = async (name: Room["name"]) => {
  return await $api.post<Room>("/auth/rooms", { name });
};

export const getRooms = async () => {
  const { data } = await $api.get<Room[]>("/auth/rooms");
  return data;
};
