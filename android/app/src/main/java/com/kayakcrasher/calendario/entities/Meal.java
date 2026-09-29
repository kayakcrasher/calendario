package com.kayakcrasher.calendario.entities;

import io.objectbox.annotation.Entity;
import io.objectbox.annotation.Id;

@Entity
public class Meal {
    @Id public long id;
    public String uuid;
    public String title;
    public String day;
    public String slot;
    public Long cookProfileId;
    public long createdAt;
}
