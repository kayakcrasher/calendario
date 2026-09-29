package com.kayakcrasher.calendario.entities;

import io.objectbox.annotation.Entity;
import io.objectbox.annotation.Id;

@Entity
public class Task {
    @Id public long id;
    public String uuid;
    public String title;
    public String dueDate;
    public String status;
    public String priority;
    public String recurrence;
    public String recurrenceUntil;
    public Long profileId;
    public long createdAt;
}
