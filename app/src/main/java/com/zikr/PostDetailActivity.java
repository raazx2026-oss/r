package com.zikr;

import android.os.Build;
import android.os.Bundle;
import android.text.Html;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import com.bumptech.glide.Glide;

public class PostDetailActivity extends AppCompatActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_post_detail);

        ImageView imgPost = findViewById(R.id.imgPostDetail);
        TextView tvTitle = findViewById(R.id.tvPostTitleDetail);
        TextView tvContent = findViewById(R.id.tvPostHtmlContent);

        // Intent se data nikalein
        String title = getIntent().getStringExtra("title");
        String imageUrl = getIntent().getStringExtra("image_url");
        String htmlContent = getIntent().getStringExtra("html_content");

        tvTitle.setText(title);

        // Glide se internet image load karein
        Glide.with(this).load(imageUrl).into(imgPost);

        // 🌟 HTML RENDER LOGIC 🌟
        if (htmlContent != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                // Naye Android devices ke liye
                tvContent.setText(Html.fromHtml(htmlContent, Html.FROM_HTML_MODE_COMPACT));
            } else {
                // Purane phones ke liye
                tvContent.setText(Html.fromHtml(htmlContent));
            }
        }
    }
}
