package com.kayakcrasher.calendario.entities;

import io.objectbox.annotation.Entity;
import io.objectbox.annotation.Id;

@Entity
public class Profile {
    @Id public long id;
    public String uuid;
    public String name;
    public String avatar;
    public String color;
    public long createdAt;
}
