package com.kayakcrasher.calendario.entities;

import io.objectbox.annotation.Entity;
import io.objectbox.annotation.Id;

@Entity
public class Event {
    @Id public long id;
    public String uuid;
    public String title;
    public String day;
    public String time;
    public String location;
    public boolean important;
    public Long profileId;
    public long createdAt;
}
